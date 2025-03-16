(
    async () => {
        try {

            const URL = "https://youtube.com/watch?v=";

            const text = await navigator.clipboard.readText();
            if (text.match(/[A-Za-z0-9]/g) && text.length === 20) 
                window.open(`${URL}${text}`, "_blank");
            else
                alert(`Not a valid ID: ${text}`)
            
        } catch (err) {
            console.error("Failed to read clipboard:", err);
        }
    }
)();
  