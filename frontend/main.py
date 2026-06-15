import webview
import os

def main():
    dir_path = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(dir_path, 'index.html')
    webview.create_window('LessNess', html_path, width=800, height=400, min_size=(800,600))
    webview.start()

if __name__ == '__main__':
    main()