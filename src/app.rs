use leptos::prelude::*;
use leptos::task::spawn_local;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{window, HtmlIFrameElement};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = ["window", "__TAURI__", "core"])]
    async fn invoke(cmd: &str, args: JsValue) -> JsValue;
}

/// Extract YouTube video ID from various URL formats
fn extract_youtube_id(url: &str) -> Option<String> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }

    // Try various patterns
    if let Ok(re) = regex_lite::Regex::new(
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
    ) {
        if let Some(caps) = re.captures(url) {
            if let Some(m) = caps.get(1) {
                return Some(m.as_str().to_string());
            }
        }
    }

    // Check if it's a direct video ID (11 characters)
    if url.len() == 11
        && url
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
    {
        return Some(url.to_string());
    }

    None
}

/// Format seconds to HH:MM:SS
fn format_time(seconds: u32) -> String {
    let h = seconds / 3600;
    let m = (seconds % 3600) / 60;
    let s = seconds % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

/// Send a command to the YouTube iframe via postMessage
fn send_youtube_command(func: &str, args: &str) {
    if let Some(document) = window().and_then(|w| w.document()) {
        if let Some(iframe) = document.get_element_by_id("youtube-player") {
            if let Ok(iframe) = iframe.dyn_into::<HtmlIFrameElement>() {
                if let Some(content_window) = iframe.content_window() {
                    let message = format!(
                        r#"{{"event":"command","func":"{}","args":[{}]}}"#,
                        func, args
                    );
                    let _ = content_window.post_message(&JsValue::from_str(&message), "*");
                }
            }
        }
    }
}

fn pause_video() {
    send_youtube_command("pauseVideo", "");
}

fn set_video_volume(volume: u32) {
    send_youtube_command("setVolume", &volume.to_string());
}

/// Add or remove a class from the body
fn toggle_body_class(class: &str, add: bool) {
    if let Some(document) = window().and_then(|w| w.document()) {
        if let Some(body) = document.body() {
            let class_list = body.class_list();
            if add {
                let _ = class_list.add_1(class);
            } else {
                let _ = class_list.remove_1(class);
            }
        }
    }
}

/// Update the dim overlay opacity
fn set_dim_opacity(opacity: f64) {
    if let Some(document) = window().and_then(|w| w.document()) {
        if let Some(overlay) = document.get_element_by_id("dim-overlay") {
            if let Some(el) = overlay.dyn_ref::<web_sys::HtmlElement>() {
                let _ = el
                    .style()
                    .set_property("background-color", &format!("rgba(0, 0, 0, {})", opacity));
            }
        }
    }
}

#[component]
pub fn App() -> impl IntoView {
    // Timer state
    let (selected_minutes, set_selected_minutes) = signal(60u32);
    let (remaining_seconds, set_remaining_seconds) = signal(0u32);
    let (total_seconds, set_total_seconds) = signal(0u32);
    let (is_running, set_is_running) = signal(false);

    // Video state
    let (video_url, set_video_url) = signal(String::new());
    let (video_id, set_video_id) = signal(Option::<String>::None);
    let (video_hint, set_video_hint) = signal(String::new());
    let (video_hint_class, set_video_hint_class) = signal(String::new());

    // Status
    let (status_text, set_status_text) = signal("READY TO POD".to_string());
    let (status_class, set_status_class) = signal(String::new());

    // Timer interval handle
    let (interval_handle, set_interval_handle) = signal(Option::<i32>::None);

    // Load video handler
    let load_video = move |_| {
        let url = video_url.get();
        if url.is_empty() {
            set_video_hint.set("Please enter a YouTube URL".to_string());
            set_video_hint_class.set("error".to_string());
            return;
        }

        match extract_youtube_id(&url) {
            Some(id) => {
                set_video_id.set(Some(id));
                toggle_body_class("video-active", true);
                set_video_hint.set("Video loaded! Set your timer 🌙".to_string());
                set_video_hint_class.set("success".to_string());
            }
            None => {
                set_video_hint.set("Could not parse YouTube URL".to_string());
                set_video_hint_class.set("error".to_string());
            }
        }
    };

    // Close video handler
    let close_video = move |_| {
        set_video_id.set(None);
        set_video_url.set(String::new());
        toggle_body_class("video-active", false);
        toggle_body_class("dim-mode", false);
        set_video_hint.set(String::new());
        set_video_hint_class.set(String::new());
    };

    // Start timer handler
    let start_timer = move |_| {
        let minutes = selected_minutes.get();
        if minutes < 1 || minutes > 480 {
            set_status_text.set("INVALID TIME (1-480 MIN)".to_string());
            set_status_class.set("warning".to_string());
            return;
        }

        let total = minutes * 60;
        set_total_seconds.set(total);
        set_remaining_seconds.set(total);
        set_is_running.set(true);
        set_status_text.set("TIMER RUNNING".to_string());
        set_status_class.set("running".to_string());

        // Enable dim mode if video is loaded
        if video_id.get().is_some() {
            toggle_body_class("dim-mode", true);
        }

        // Start interval
        if let Some(win) = window() {
            let callback = Closure::<dyn Fn()>::new(move || {
                let remaining = remaining_seconds.get();
                let total = total_seconds.get();

                if remaining > 0 {
                    let new_remaining = remaining - 1;
                    set_remaining_seconds.set(new_remaining);

                    // Update status based on remaining time
                    if new_remaining <= 10 {
                        set_status_text.set("ALMOST THERE...".to_string());
                        set_status_class.set("warning".to_string());
                    } else if new_remaining <= 60 {
                        set_status_text.set("GETTING SLEEPY...".to_string());
                        set_status_class.set("warning".to_string());
                    }

                    // Progressive dimming
                    if total > 0 {
                        let progress = (total - new_remaining) as f64 / total as f64;
                        let opacity = progress * 0.9;
                        set_dim_opacity(opacity);
                    }

                    // Volume fade in last 10%
                    if total > 0 && video_id.get_untracked().is_some() {
                        let ten_percent = total / 10;
                        if new_remaining <= ten_percent && ten_percent > 0 {
                            let volume = (new_remaining as f64 / ten_percent as f64 * 100.0) as u32;
                            set_video_volume(volume);
                        }
                    }
                } else {
                    // Timer finished
                    set_is_running.set(false);
                    set_status_text.set("SWEET DREAMS WHALE!".to_string());
                    set_status_class.set(String::new());

                    // Clear interval
                    if let Some(handle) = interval_handle.get_untracked() {
                        if let Some(win) = window() {
                            win.clear_interval_with_handle(handle);
                        }
                    }
                    set_interval_handle.set(None);

                    // Pause video
                    pause_video();

                    // Call suspend
                    spawn_local(async move {
                        invoke("suspend_system", JsValue::NULL).await;
                    });
                }
            });

            if let Ok(handle) = win.set_interval_with_callback_and_timeout_and_arguments_0(
                callback.as_ref().unchecked_ref(),
                1000,
            ) {
                set_interval_handle.set(Some(handle));
            }

            callback.forget();
        }
    };

    // Cancel timer handler
    let cancel_timer = move |_| {
        set_is_running.set(false);
        set_remaining_seconds.set(0);
        set_total_seconds.set(0);
        set_status_text.set("TIMER CANCELLED".to_string());
        set_status_class.set(String::new());

        // Clear interval
        if let Some(handle) = interval_handle.get() {
            if let Some(win) = window() {
                win.clear_interval_with_handle(handle);
            }
        }
        set_interval_handle.set(None);

        // Reset dimming
        set_dim_opacity(0.0);

        // Reset volume
        if video_id.get().is_some() {
            set_video_volume(100);
        }
    };

    // Computed values
    let timer_display = move || format_time(remaining_seconds.get());

    let progress_percent = move || {
        let total = total_seconds.get();
        let remaining = remaining_seconds.get();
        if total > 0 {
            ((total - remaining) as f64 / total as f64 * 100.0) as u32
        } else {
            0
        }
    };

    let is_video_loaded = move || video_id.get().is_some();

    let youtube_embed_url = move || {
        video_id.get().map(|id| {
            format!(
                "https://www.youtube.com/embed/{}?autoplay=1&enablejsapi=1",
                id
            )
        })
    };

    view! {
        <div class="dim-overlay" id="dim-overlay"></div>

        <div class="corner-decor corner-tl"></div>
        <div class="corner-decor corner-tr"></div>
        <div class="corner-decor corner-bl"></div>
        <div class="corner-decor corner-br"></div>

        <div class="app-container">
            <header class="header">
                <span class="moon-icon">"🐳"</span>
                <h1 class="title">"SLEEPY WHALE PLAYER"</h1>
                <p class="subtitle">"Getting eepy?"</p>
            </header>

            {move || {
                if is_video_loaded() {
                    view! {
                        <section class="video-section">
                            <div class="video-container pixel-border">
                                <div class="video-wrapper">
                                    {move || youtube_embed_url().map(|url| view! {
                                        <iframe
                                            id="youtube-player"
                                            src=url
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowfullscreen=true
                                        ></iframe>
                                    })}
                                </div>
                                <button
                                    class="video-close-btn"
                                    on:click=close_video
                                    title="Close video"
                                >"✕"</button>
                            </div>
                        </section>
                    }.into_any()
                } else {
                    view! {
                        <div class="video-input-group">
                            <label for="video-url">"📺 VIDEO URL"</label>
                            <div class="video-input-row">
                                <input
                                    type="url"
                                    id="video-url"
                                    class="video-input pixel-border"
                                    placeholder="Paste YouTube link..."
                                    prop:value=move || video_url.get()
                                    on:input=move |ev| set_video_url.set(event_target_value(&ev))
                                />
                                <button
                                    class="btn btn-load pixel-border"
                                    on:click=load_video
                                >"LOAD"</button>
                            </div>
                            <p class=move || format!("video-hint {}", video_hint_class.get())>
                                {move || video_hint.get()}
                            </p>
                        </div>
                    }.into_any()
                }
            }}

            <main class="panel pixel-border">
                <div class="timer-display pixel-border">
                    <div class="timer-value">{timer_display}</div>
                    <div class="timer-label">"REMAINING"</div>
                    {move || if is_running.get() {
                        view! {
                            <span class="zzz">"z"</span>
                            <span class="zzz">"z"</span>
                            <span class="zzz">"z"</span>
                        }.into_any()
                    } else {
                        view! { <span></span> }.into_any()
                    }}
                </div>

                <div class="progress-container pixel-border">
                    <div
                        class=move || if is_running.get() { "progress-bar active" } else { "progress-bar" }
                        style=move || format!("width: {}%", progress_percent())
                    ></div>
                </div>

                <div class="preset-grid">
                    <button
                        class=move || if selected_minutes.get() == 15 && !is_running.get() { "preset-btn pixel-border selected" } else { "preset-btn pixel-border" }
                        disabled=move || is_running.get()
                        on:click=move |_| set_selected_minutes.set(15)
                    >"15m"</button>
                    <button
                        class=move || if selected_minutes.get() == 30 && !is_running.get() { "preset-btn pixel-border selected" } else { "preset-btn pixel-border" }
                        disabled=move || is_running.get()
                        on:click=move |_| set_selected_minutes.set(30)
                    >"30m"</button>
                    <button
                        class=move || if selected_minutes.get() == 45 && !is_running.get() { "preset-btn pixel-border selected" } else { "preset-btn pixel-border" }
                        disabled=move || is_running.get()
                        on:click=move |_| set_selected_minutes.set(45)
                    >"45m"</button>
                    <button
                        class=move || if selected_minutes.get() == 60 && !is_running.get() { "preset-btn pixel-border selected" } else { "preset-btn pixel-border" }
                        disabled=move || is_running.get()
                        on:click=move |_| set_selected_minutes.set(60)
                    >"1h"</button>
                    <button
                        class=move || if selected_minutes.get() == 90 && !is_running.get() { "preset-btn pixel-border selected" } else { "preset-btn pixel-border" }
                        disabled=move || is_running.get()
                        on:click=move |_| set_selected_minutes.set(90)
                    >"1.5h"</button>
                    <button
                        class=move || if selected_minutes.get() == 120 && !is_running.get() { "preset-btn pixel-border selected" } else { "preset-btn pixel-border" }
                        disabled=move || is_running.get()
                        on:click=move |_| set_selected_minutes.set(120)
                    >"2h"</button>
                    <button
                        class=move || if selected_minutes.get() == 180 && !is_running.get() { "preset-btn pixel-border selected" } else { "preset-btn pixel-border" }
                        disabled=move || is_running.get()
                        on:click=move |_| set_selected_minutes.set(180)
                    >"3h"</button>
                    <button
                        class=move || if selected_minutes.get() == 240 && !is_running.get() { "preset-btn pixel-border selected" } else { "preset-btn pixel-border" }
                        disabled=move || is_running.get()
                        on:click=move |_| set_selected_minutes.set(240)
                    >"4h"</button>
                </div>

                <div class="custom-input-group">
                    <label for="custom-minutes">"CUSTOM:"</label>
                    <input
                        type="number"
                        id="custom-minutes"
                        class="custom-input pixel-border"
                        min="1"
                        max="480"
                        placeholder="60"
                        disabled=move || is_running.get()
                        on:input=move |ev| {
                            if let Ok(val) = event_target_value(&ev).parse::<u32>() {
                                set_selected_minutes.set(val);
                            }
                        }
                    />
                    <span style="font-size: 8px; color: var(--text-dim);">"MIN"</span>
                </div>

                <div class="action-buttons">
                    {move || if !is_running.get() {
                        view! {
                            <button
                                class="btn btn-primary pixel-border"
                                on:click=start_timer
                            >"▶ START"</button>
                        }.into_any()
                    } else {
                        view! {
                            <button
                                class="btn btn-danger pixel-border"
                                on:click=cancel_timer
                            >"■ CANCEL"</button>
                        }.into_any()
                    }}
                </div>

                <p class=move || format!("status {}", status_class.get())>
                    {move || status_text.get()}
                </p>
            </main>

            <footer class="footer">
                <span class="footer-icon">"💤"</span>
                " PAUSES MEDIA + SLEEPS COMPUTER "
                <span class="footer-icon">"💤"</span>
            </footer>
        </div>

        <div class="branding">"by sleepy whale co."</div>
    }
}
