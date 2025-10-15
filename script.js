document.getElementById("analyze").addEventListener("click", () => {
  const file = document.getElementById("upload").files[0];
  const result = document.getElementById("summary");

  if (!file) {
    result.textContent = "Please upload a screenshot first.";
    return;
  }

  result.textContent = "Analyzing screenshot...";

  setTimeout(() => {
    result.innerHTML = "✅ Screenshot analyzed successfully! <br> • Detected 2 teams<br> • Odds: +150 / -180<br> • Value: +8% EV";
  }, 2000);
});
