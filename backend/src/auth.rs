use crate::models::{LoginRequest, LoginResponse};
use actix_web::{HttpRequest, HttpResponse, cookie::Cookie, web};
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Access token TTL: 24 hours
const ACCESS_TOKEN_TTL_SECS: i64 = 86400 * 1;
/// Refresh token TTL: 30 days
const REFRESH_TOKEN_TTL_SECS: i64 = 86400 * 30;

#[derive(Clone)]
pub struct AuthConfig {
    pub username: String,
    pub password: String,
    pub secret: String,
}

impl AuthConfig {
    pub fn from_env() -> Self {
        let secret = std::env::var("PI_DASH_SECRET").unwrap_or_else(|_| {
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

    /// Create a short-lived access token (15 min).
    pub fn create_access_token(&self) -> String {
        let expiry = Utc::now().timestamp() + ACCESS_TOKEN_TTL_SECS;
        self.sign_token("access", expiry)
    }

    /// Create a long-lived refresh token (7 days).
    pub fn create_refresh_token(&self) -> String {
        let expiry = Utc::now().timestamp() + REFRESH_TOKEN_TTL_SECS;
        self.sign_token("refresh", expiry)
    }

    /// Internal: build and HMAC-sign a token.
    /// Format: `pi-dash:<kind>:<expiry>:<hmac>`
    fn sign_token(&self, kind: &str, expiry: i64) -> String {
        let payload = format!("pi-dash:{}:{}", kind, expiry);
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes()).expect("HMAC key error");
        mac.update(payload.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());
        format!("{}:{}", payload, signature)
    }

    /// Validate any token. Returns `Some(kind)` ("access" or "refresh") on success.
    pub fn validate_token(&self, token: &str) -> Option<String> {
        // Format: pi-dash:<kind>:<expiry>:<hmac>
        let parts: Vec<&str> = token.splitn(4, ':').collect();
        if parts.len() != 4 || parts[0] != "pi-dash" {
            return None;
        }

        let kind = parts[1];
        let expiry_str = parts[2];
        let sig = parts[3];
        let payload = format!("pi-dash:{}:{}", kind, expiry_str);

        // Check expiry
        if let Ok(expiry) = expiry_str.parse::<i64>() {
            if Utc::now().timestamp() > expiry {
                return None;
            }
        } else {
            return None;
        }

        // Check HMAC
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes()).expect("HMAC key error");
        mac.update(payload.as_bytes());
        let expected = hex::encode(mac.finalize().into_bytes());
        if sig == expected {
            Some(kind.to_string())
        } else {
            None
        }
    }

    /// Validate that the token is a valid *access* token.
    pub fn validate_access_token(&self, token: &str) -> bool {
        self.validate_token(token).as_deref() == Some("access")
    }

    /// Validate that the token is a valid *refresh* token.
    pub fn validate_refresh_token(&self, token: &str) -> bool {
        self.validate_token(token).as_deref() == Some("refresh")
    }
}

/// Extract the access token from Authorization header, cookie, or query param.
pub fn extract_token(req: &HttpRequest) -> Option<String> {
    // Check Authorization header first
    if let Some(auth) = req.headers().get("Authorization") {
        if let Ok(val) = auth.to_str() {
            if let Some(token) = val.strip_prefix("Bearer ") {
                return Some(token.to_string());
            }
        }
    }
    // Check cookie
    if let Some(cookie) = req.cookie("pi_dash_token") {
        return Some(cookie.value().to_string());
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

/// Extract the refresh token from the HttpOnly cookie.
fn extract_refresh_token(req: &HttpRequest) -> Option<String> {
    req.cookie("pi_dash_refresh").map(|c| c.value().to_string())
}

fn make_refresh_cookie(token: &str) -> Cookie<'static> {
    Cookie::build("pi_dash_refresh", token.to_owned())
        .path("/api/refresh")
        .http_only(true)
        .same_site(actix_web::cookie::SameSite::Strict)
        .max_age(actix_web::cookie::time::Duration::days(7))
        .finish()
}

pub async fn login(auth: web::Data<AuthConfig>, body: web::Json<LoginRequest>) -> HttpResponse {
    if body.username == auth.username && body.password == auth.password {
        let access_token = auth.create_access_token();
        let refresh_token = auth.create_refresh_token();

        let refresh_cookie = make_refresh_cookie(&refresh_token);

        HttpResponse::Ok()
            .cookie(refresh_cookie)
            .json(LoginResponse {
                token: access_token,
            })
    } else {
        HttpResponse::Unauthorized().json(serde_json::json!({"error": "Invalid credentials"}))
    }
}

pub async fn refresh(auth: web::Data<AuthConfig>, req: HttpRequest) -> HttpResponse {
    if let Some(refresh_token) = extract_refresh_token(&req) {
        if auth.validate_refresh_token(&refresh_token) {
            let new_access_token = auth.create_access_token();
            let new_refresh_token = auth.create_refresh_token();
            let refresh_cookie = make_refresh_cookie(&new_refresh_token);

            return HttpResponse::Ok()
                .cookie(refresh_cookie)
                .json(LoginResponse {
                    token: new_access_token,
                });
        }
    }
    HttpResponse::Unauthorized()
        .json(serde_json::json!({"error": "Invalid or expired refresh token"}))
}

pub async fn logout(_req: HttpRequest) -> HttpResponse {
    // Expire the refresh cookie
    let expired_cookie = Cookie::build("pi_dash_refresh", "")
        .path("/api/refresh")
        .http_only(true)
        .max_age(actix_web::cookie::time::Duration::seconds(0))
        .finish();

    HttpResponse::Ok()
        .cookie(expired_cookie)
        .json(serde_json::json!({"ok": true}))
}

pub async fn check_auth(auth: web::Data<AuthConfig>, req: HttpRequest) -> HttpResponse {
    if let Some(token) = extract_token(&req) {
        if auth.validate_access_token(&token) {
            return HttpResponse::Ok().json(serde_json::json!({"authenticated": true}));
        }
    }
    HttpResponse::Unauthorized().json(serde_json::json!({"authenticated": false}))
}
