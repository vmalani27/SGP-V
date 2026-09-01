from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'hello from the app')

    def log_message(self, *args):
        pass

print('ready')
HTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
