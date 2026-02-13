//! SV2 UI Server
//!
//! A lightweight web server that serves the Stratum V2 monitoring dashboard
//! and proxies API requests to Translator and JDC services.
//!
//! # Usage
//!
//! ```bash
//! # Start with default settings (auto-detects services on localhost)
//! sv2-ui
//!
//! # Specify service URLs
//! sv2-ui --translator-url http://192.168.1.10:9092 --jdc-url http://192.168.1.10:9091
//!
//! # Custom port
//! sv2-ui --port 8080
//!
//! # Don't open browser automatically
//! sv2-ui --no-open
//! ```

use axum::{
    body::Body,
    extract::State,
    http::{header, Request, Response, StatusCode, Uri},
    routing::get,
    Router,
};
use clap::Parser;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use rust_embed::Embed;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn, Level};
use tracing_subscriber::FmtSubscriber;

/// Embed the built UI assets from ../dist
#[derive(Embed)]
#[folder = "../dist"]
struct Assets;

/// Application state shared across handlers
#[derive(Clone)]
struct AppState {
    translator_url: String,
    jdc_url: String,
    client: Client<hyper_util::client::legacy::connect::HttpConnector, Body>,
}

/// SV2 UI Server - Stratum V2 Monitoring Dashboard
#[derive(Parser, Debug)]
#[command(name = "sv2-ui")]
#[command(about = "Serves the Stratum V2 monitoring dashboard", long_about = None)]
struct Args {
    /// Port to listen on
    #[arg(short, long, default_value = "3000")]
    port: u16,

    /// Host to bind to
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Translator Proxy monitoring URL
    #[arg(long, default_value = "http://127.0.0.1:9092")]
    translator_url: String,

    /// JDC monitoring URL
    #[arg(long, default_value = "http://127.0.0.1:9091")]
    jdc_url: String,

    /// Don't automatically open the browser
    #[arg(long)]
    no_open: bool,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    // Initialize logging
    FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .compact()
        .init();

    // Create HTTP client for proxying
    let client = Client::builder(TokioExecutor::new()).build_http();

    let state = AppState {
        translator_url: args.translator_url.trim_end_matches('/').to_string(),
        jdc_url: args.jdc_url.trim_end_matches('/').to_string(),
        client,
    };

    info!("Translator URL: {}", state.translator_url);
    info!("JDC URL: {}", state.jdc_url);

    // Build CORS layer
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the router with proxy routes
    let app = Router::new()
        .route("/health", get(health_check))
        // Proxy routes for API
        .route("/translator-api/*path", 
            get(proxy_translator)
            .post(proxy_translator)
            .put(proxy_translator)
            .delete(proxy_translator))
        .route("/jdc-api/*path", 
            get(proxy_jdc)
            .post(proxy_jdc)
            .put(proxy_jdc)
            .delete(proxy_jdc))
        .fallback(serve_static)
        .layer(cors)
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .parse()
        .expect("Invalid address");

    info!("Starting SV2 UI server on http://{}", addr);

    if !args.no_open {
        let url = format!("http://localhost:{}", args.port);
        info!("Opening browser at {}", url);
        if let Err(e) = open::that(&url) {
            warn!("Failed to open browser: {}", e);
        }
    }

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "ok"
}

/// Proxy requests to Translator
async fn proxy_translator(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response<Body> {
    let path = req.uri().path().strip_prefix("/translator-api").unwrap_or("");
    let query = req.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
    let target_url = format!("{}/api{}{}", state.translator_url, path, query);
    
    proxy_request(state.client, req, &target_url).await
}

/// Proxy requests to JDC
async fn proxy_jdc(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response<Body> {
    let path = req.uri().path().strip_prefix("/jdc-api").unwrap_or("");
    let query = req.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
    let target_url = format!("{}/api{}{}", state.jdc_url, path, query);
    
    proxy_request(state.client, req, &target_url).await
}

/// Generic proxy function
async fn proxy_request(
    client: Client<hyper_util::client::legacy::connect::HttpConnector, Body>,
    req: Request<Body>,
    target_url: &str,
) -> Response<Body> {
    let uri: Uri = match target_url.parse() {
        Ok(u) => u,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Body::from("Invalid target URL"))
                .unwrap();
        }
    };

    // Build proxied request
    let mut proxy_req = Request::builder()
        .method(req.method().clone())
        .uri(&uri);
    
    // Copy relevant headers
    for (key, value) in req.headers() {
        if key != header::HOST {
            proxy_req = proxy_req.header(key, value);
        }
    }

    let proxy_req = match proxy_req.body(req.into_body()) {
        Ok(r) => r,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from("Failed to build proxy request"))
                .unwrap();
        }
    };

    // Execute request
    match client.request(proxy_req).await {
        Ok(resp) => {
            let (parts, body) = resp.into_parts();
            let body = Body::new(body);
            Response::from_parts(parts, body)
        }
        Err(e) => {
            warn!("Proxy error to {}: {}", target_url, e);
            Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(format!(
                    r#"{{"error": "Service unavailable", "details": "{}"}}"#,
                    e
                )))
                .unwrap()
        }
    }
}

/// Serve static files from embedded assets
async fn serve_static(uri: Uri) -> Response<Body> {
    let path = uri.path().trim_start_matches('/');

    // Try to serve the exact file
    if let Some(content) = Assets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime.as_ref())
            .body(Body::from(content.data.into_owned()))
            .unwrap();
    }

    // For SPA routing: serve index.html for any non-file path
    if let Some(content) = Assets::get("index.html") {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html")
            .body(Body::from(content.data.into_owned()))
            .unwrap();
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("UI assets not found"))
        .unwrap()
}
