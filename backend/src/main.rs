mod auth;
mod collector;
mod history;
mod models;
mod ws;

use actix_files::Files;
use actix_web::{App, HttpRequest, HttpResponse, HttpServer, web};
use log::info;
use std::sync::Arc;
use tokio::sync::broadcast;

use auth::AuthConfig;
use collector::Collector;
use history::HistoryStore;
use models::HistoryQuery;
use parking_lot::Mutex;

async fn api_history(
    req: HttpRequest,
    auth: web::Data<AuthConfig>,
    history: web::Data<HistoryStore>,
    query: web::Query<HistoryQuery>,
) -> HttpResponse {
    // Check auth
    if let Some(token) = auth::extract_token(&req) {
        if !auth.validate_access_token(&token) {
            return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
        }
    } else {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    let range = query.range.as_deref().unwrap_or("day");
    let points = match range {
        "raw" => history.get_raw(),
        "week" => history.get_week(),
        _ => history.get_day(),
    };

    HttpResponse::Ok().json(models::HistoryResponse {
        range: range.to_string(),
        points,
    })
}

async fn api_stats(
    req: HttpRequest,
    auth: web::Data<AuthConfig>,
    collector: web::Data<Arc<Mutex<Collector>>>,
) -> HttpResponse {
    if let Some(token) = auth::extract_token(&req) {
        if !auth.validate_access_token(&token) {
            return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
        }
    } else {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    let stats = collector.lock().collect();
    HttpResponse::Ok().json(stats)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let port: u16 = std::env::var("PI_DASH_PORT")
        .unwrap_or_else(|_| "3300".to_string())
        .parse()
        .expect("PI_DASH_PORT must be a valid port number");

    let auth_config = AuthConfig::from_env();
    info!("Pi Dash starting on port {}", port);
    info!("Username: {}", auth_config.username);

    let history = HistoryStore::new();
    let (ws_tx, _) = broadcast::channel::<String>(128);
    let collector = Arc::new(Mutex::new(Collector::new()));

    // Background collection task
    let bg_collector = collector.clone();
    let bg_history = history.clone();
    let bg_tx = ws_tx.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
        let mut ticks = 0;
        let mut delay_secs = 1;

        loop {
            interval.tick().await;
            ticks += 1;

            let active = bg_tx.receiver_count() > 0;
            if active {
                delay_secs = 1;
            }

            if ticks >= delay_secs {
                let stats = bg_collector.lock().collect();
                bg_history.push(&stats);
                if let Ok(json) = serde_json::to_string(&stats) {
                    let _ = bg_tx.send(json);
                }

                ticks = 0;

                if active {
                    delay_secs = 1;
                } else {
                    delay_secs = match delay_secs {
                        1 => 5,
                        5 => 10,
                        10 => 30,
                        _ => 60,
                    };
                }
            }
        }
    });

    let auth_data = web::Data::new(auth_config);
    let history_data = web::Data::new(history.clone());
    let ws_tx_data = web::Data::new(ws_tx);
    let collector_data = web::Data::new(collector);

    let server = HttpServer::new(move || {
        App::new()
            .app_data(auth_data.clone())
            .app_data(history_data.clone())
            .app_data(ws_tx_data.clone())
            .app_data(collector_data.clone())
            .route("/api/login", web::post().to(auth::login))
            .route("/api/refresh", web::post().to(auth::refresh))
            .route("/api/logout", web::post().to(auth::logout))
            .route("/api/auth", web::get().to(auth::check_auth))
            .route("/api/history", web::get().to(api_history))
            .route("/api/stats", web::get().to(api_stats))
            .route("/ws", web::get().to(ws::ws_handler))
            // Serve static files (React build) - must be last
            .service(
                Files::new("/", "./static")
                    .index_file("index.html")
                    .default_handler(web::to(|| async {
                        // SPA fallback: serve index.html for all non-API routes
                        let index = std::fs::read_to_string("./static/index.html")
                            .unwrap_or_else(|_| "Pi Dash - Frontend not found".to_string());
                        HttpResponse::Ok().content_type("text/html").body(index)
                    })),
            )
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run();

    let res = server.await;
    println!("Shutting down, saving history data to disk...");
    history.save_to_disk();
    res
}
