# Task JSON Exporter Demo

This is a bare-bones Chrome extension created to demonstrate a single piece of functionality: extracting and copying a task's JSON body to the clipboard.

## How to Use

1.  **Load the Extension:**
    *   Open Chrome and go to `chrome://extensions`.
    *   Enable "Developer mode" using the toggle in the top-right corner.
    *   Click "Load unpacked".
    *   Select the `task_json_exporter` folder.

2.  **Log In:**
    *   Make sure you are logged into `app.outlier.ai` in your browser. This is necessary for the extension to get the required authentication cookie.

3.  **Copy Task JSON:**
    *   Navigate to a task page, specifically one with a URL matching: `https://app.outlier.ai/en/expert/outlieradmin/tools/chat_bulk_audit/...`
    *   Press the keyboard shortcut `Alt+C`.

## What Happens

- If you are on the correct page, the extension will make the necessary API calls to fetch the task's JSON data.
- The formatted JSON will be copied to your clipboard.
- An `alert` will appear confirming that the JSON was copied.
- If you are on the wrong page or if an error occurs (e.g., you are not logged in), an `alert` will notify you of the issue.
