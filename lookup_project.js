function formatDate(daysAgo) {
    let today = new Date();
    daysAgo = daysAgo - 1;
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;

    let td = new Date();
    td.setDate(td.getDate() - daysAgo);
    const y = td.getFullYear();
    const m = String(td.getMonth() + 1).padStart(2, '0');
    const d = String(td.getDate()).padStart(2, '0');
    const t = `${y}-${m}-${d}`;

    return `?dateRange=${t},${todayDate}`;
}

(async () => {
    try {
        const data = await chrome.storage.sync.get(["lookupMode", "projectDays"]);
        const lookupMode = data.lookupMode || "clipboard";
        const days = parseInt(data.projectDays) || 2;
        let text = "";

        if (lookupMode === "clipboard") {
            text = await navigator.clipboard.readText();
        } else {
            text = getSelectedText();
        }

        if (text.match(/[A-Za-z0-9]/g) && text.length === 24) {
            const dateSuffix = formatDate(days);
            window.open(`https://app.outlier.ai/en/expert/outlieradmin/tools/qc_audit_disputes/${text}${dateSuffix}`, "_blank");
        } else {
            alert(`Not a valid ID: ${text}`);
        }

    } catch (err) {
        console.error("Failed to read ID:", err);
        alert("Error fetching task. Make sure you have a valid ID copied or highlighted.");
    }
})();

function getSelectedText() {
    return window.getSelection().toString().trim();
}
