use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use futures_util::StreamExt;
use tokio::sync::broadcast;
use log::{info, warn};
use crate::auth::{AuthConfig, extract_token};

pub type WsBroadcast = broadcast::Sender<String>;

pub async fn ws_handler(
    req: HttpRequest,
    stream: web::Payload,
    auth: web::Data<AuthConfig>,
    tx: web::Data<WsBroadcast>,
) -> Result<HttpResponse, actix_web::Error> {
    // Validate auth
    if let Some(token) = extract_token(&req) {
        if !auth.validate_token(&token) {
            return Ok(HttpResponse::Unauthorized().finish());
        }
    } else {
        return Ok(HttpResponse::Unauthorized().finish());
    }

    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;
    let mut rx = tx.subscribe();

    // Spawn task to forward broadcast messages to this client
    actix_rt::spawn(async move {
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Ok(text) => {
                            if session.text(text).await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            warn!("WebSocket client lagged by {} messages", n);
                            continue;
                        }
                        Err(_) => break,
                    }
                }
                ws_msg = msg_stream.next() => {
                    match ws_msg {
                        Some(Ok(Message::Ping(bytes))) => {
                            let _ = session.pong(&bytes).await;
                        }
                        Some(Ok(Message::Close(_))) | None => break,
                        _ => {}
                    }
                }
            }
        }
        let _ = session.close(None).await;
        info!("WebSocket client disconnected");
    });

    Ok(response)
}
