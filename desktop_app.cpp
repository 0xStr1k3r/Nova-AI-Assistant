#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <string>
#include <cstdlib>

static void destroy_window_cb(GtkWidget* widget, gpointer data) {
    gtk_main_quit();
}

static gboolean permission_requested_cb(WebKitWebView* web_view, WebKitPermissionRequest* request, gpointer user_data) {
    // Automatically allow media stream (microphone) and other permission requests inside the local C++ app
    webkit_permission_request_allow(request);
    return TRUE;
}

int main(int argc, char* argv[]) {
    // Disable WebKit sandboxing environment variables to allow audio device/driver access
    setenv("WEBKIT_FORCE_SANDBOX", "0", 1);
    setenv("WEBKIT_DISABLE_SANDBOX_THIS_IS_EXCEEDINGLY_DANGEROUS", "1", 1);

    // Initialize GTK+
    gtk_init(&argc, &argv);

    // Get default web context and disable sandboxing via API
    WebKitWebContext* context = webkit_web_context_get_default();
    webkit_web_context_set_sandbox_enabled(context, FALSE);

    // Create the main window
    GtkWidget* main_window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_default_size(GTK_WINDOW(main_window), 1024, 768);
    gtk_window_set_title(GTK_WINDOW(main_window), "Nova AI Assistant (Development Stage)");

    // Create the WebKit web view with our custom context
    GtkWidget* web_view = webkit_web_view_new_with_context(context);

    // Connect permission request signal to automatically allow microphone/media access
    g_signal_connect(web_view, "permission-request", G_CALLBACK(permission_requested_cb), NULL);

    // Configure WebKit settings
    WebKitSettings* settings = webkit_web_view_get_settings(WEBKIT_WEB_VIEW(web_view));
    webkit_settings_set_enable_write_console_messages_to_stdout(settings, TRUE);
    webkit_settings_set_enable_media_stream(settings, TRUE); // Enable media streams (mic)
    webkit_settings_set_enable_mediasource(settings, TRUE);

    // Add the web view to the main window
    gtk_container_add(GTK_CONTAINER(main_window), web_view);

    // Connect destroy signal
    g_signal_connect(main_window, "destroy", G_CALLBACK(destroy_window_cb), NULL);

    // Get port from environment or default to 22233 for desktop
    const char* port_env = std::getenv("PORT");
    std::string port = port_env ? port_env : "22233";
    std::string url = "http://localhost:" + port;

    // Load the local assistant web server
    webkit_web_view_load_uri(WEBKIT_WEB_VIEW(web_view), url.c_str());

    // Show all widgets
    gtk_widget_show_all(main_window);

    // Start GTK main loop
    gtk_main();

    return 0;
}
