use actix_web::{web, HttpRequest, HttpResponse, cookie::Cookie};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use chrono::Utc;
use crate::models::{LoginRequest, LoginResponse};

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
pub struct AuthConfig {
    pub username: String,
    pub password: String,
    pub secret: String,
}

impl AuthConfig {
    pub fn from_env() -> Self {
        let secret = std::env::var("PI_DASH_SECRET")
            .unwrap_or_else(|_| {
                use rand::Rng;
                let mut rng = rand::thread_rng();
                let bytes: Vec<u8> = (0..32).map(|_| rng.r#gen()).collect();
                hex::encode(bytes)
            });

        AuthConfig {
            username: std::env::var("PI_DASH_USER").unwrap_or_else(|_| "admin".to_string()),
            password: std::env::var("PI_DASH_PASS").unwrap_or_else(|_| "admin".to_string()),
            secret,
        }
    }

    pub fn create_token(&self) -> String {
        let expiry = Utc::now().timestamp() + 86400; // 24h
        let payload = format!("pi-dash:{}", expiry);
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
            .expect("HMAC key error");
        mac.update(payload.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());
        format!("{}:{}", payload, signature)
    }

    pub fn validate_token(&self, token: &str) -> bool {
        let parts: Vec<&str> = token.splitn(3, ':').collect();
        if parts.len() != 3 {
            return false;
        }

        let payload = format!("{}:{}", parts[0], parts[1]);
        let sig = parts[2];

        // Check expiry
        if let Ok(expiry) = parts[1].parse::<i64>() {
            if Utc::now().timestamp() > expiry {
                return false;
            }
        } else {
            return false;
        }

        // Check HMAC
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
            .expect("HMAC key error");
        mac.update(payload.as_bytes());
        let expected = hex::encode(mac.finalize().into_bytes());
        sig == expected
    }
}

pub fn extract_token(req: &HttpRequest) -> Option<String> {
    // Check cookie first
    if let Some(cookie) = req.cookie("pi_dash_token") {
        return Some(cookie.value().to_string());
    }
    // Check Authorization header
    if let Some(auth) = req.headers().get("Authorization") {
        if let Ok(val) = auth.to_str() {
            if let Some(token) = val.strip_prefix("Bearer ") {
                return Some(token.to_string());
            }
        }
    }
    // Check query param (for WebSocket)
    if let Some(query) = req.uri().query() {
        for part in query.split('&') {
            if let Some(token) = part.strip_prefix("token=") {
                return Some(token.to_string());
            }
        }
    }
    None
}

pub async fn login(
    auth: web::Data<AuthConfig>,
    body: web::Json<LoginRequest>,
) -> HttpResponse {
    if body.username == auth.username && body.password == auth.password {
        let token = auth.create_token();
        let cookie = Cookie::build("pi_dash_token", token.clone())
            .path("/")
            .http_only(true)
            .max_age(actix_web::cookie::time::Duration::hours(24))
            .finish();

        HttpResponse::Ok()
            .cookie(cookie)
            .json(LoginResponse { token })
    } else {
        HttpResponse::Unauthorized().json(serde_json::json!({"error": "Invalid credentials"}))
    }
}

pub async fn check_auth(
    auth: web::Data<AuthConfig>,
    req: HttpRequest,
) -> HttpResponse {
    if let Some(token) = extract_token(&req) {
        if auth.validate_token(&token) {
            return HttpResponse::Ok().json(serde_json::json!({"authenticated": true}));
        }
    }
    HttpResponse::Unauthorized().json(serde_json::json!({"authenticated": false}))
}
