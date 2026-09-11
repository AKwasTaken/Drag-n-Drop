document.addEventListener("DOMContentLoaded", () => {
  const REPO_OWNER = "cmitiiser";
  const REPO_NAME = "cmitiiser.github.io";
  const BRANCH = "main";

  const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "ico"];
  const DOC_EXTS = ["pdf", "xlsx", "xls", "csv", "doc", "docx", "ppt", "pptx", "txt"];

  const dropZone = document.getElementById("drop-zone");
  const dropTrigger = document.getElementById("drop-trigger");
  const fileInput = document.getElementById("file-input");
  const tokenInput = document.getElementById("gh-token");
  const statusContainer = document.getElementById("status-container");

  // Load saved token from local storage
  tokenInput.value = localStorage.getItem("anvesha_pat") || "";
  tokenInput.addEventListener("input", () => {
    localStorage.setItem("anvesha_pat", tokenInput.value.trim());
  });

  // Browse dialog triggers
  dropTrigger.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      fileInput.value = "";
    }
  });

  // Fullscreen drag & drop detection
  let dragCounter = 0;

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    dropZone.classList.add("is-dragover");
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropZone.classList.remove("is-dragover");
    }
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove("is-dragover");

    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  });

  // Folder assignment logic
  function resolveTargetFolder(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    if (IMAGE_EXTS.includes(ext)) return "img";
    if (DOC_EXTS.includes(ext)) return "doc";
    return "file";
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(files) {
    const token = tokenInput.value.trim();
    if (!token) {
      alert("Please enter a valid GitHub token before uploading.");
      tokenInput.focus();
      return;
    }

    for (const file of files) {
      await uploadFile(file, token);
    }
  }

  async function uploadFile(file, token) {
    const folder = resolveTargetFolder(file.name);
    const sanitizedName = file.name.replace(/\s+/g, "-");
    const targetPath = `${folder}/${sanitizedName}`;

    const card = document.createElement("div");
    card.className = "anv-upload-card uploading";
    card.innerHTML = `
      <div class="anv-card-header">
        <span>${sanitizedName}</span>
        <span class="status-label">Staging to GitHub...</span>
      </div>
      <div class="anv-card-meta">Target destination: /${targetPath}</div>
    `;
    statusContainer.prepend(card);

    try {
      const base64Content = await toBase64(file);

      // Check for existing file SHA to enable overwriting
      let sha = null;
      const getRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${targetPath}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (getRes.ok) {
        const fileInfo = await getRes.json();
        sha = fileInfo.sha;
      }

      // Commit to GitHub via PUT /contents/
      const putRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${targetPath}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Anvesha dispatch: ${targetPath}`,
            content: base64Content,
            sha: sha || undefined,
            branch: BRANCH,
          }),
        }
      );

      if (!putRes.ok) {
        const errorData = await putRes.json();
        throw new Error(errorData.message || "Commit rejected by GitHub API.");
      }

      const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${targetPath}`;

      card.className = "anv-upload-card success";
      card.innerHTML = `
        <div class="anv-card-header">
          <strong>${sanitizedName}</strong>
          <span style="color: var(--moss);">&check; Committed</span>
        </div>
        <div class="anv-card-meta">Path: ${targetPath}</div>
        <div class="anv-link-output">
          <input type="text" class="anv-link-input" value="${rawUrl}" readonly />
          <button class="anv-copy-btn">Copy Link</button>
        </div>
        <p class="anv-delay-warning">
          &#9888; <strong>Notice:</strong> The file might still be caching on GitHub's raw CDN servers. If the link returns 404 or an older version, allow 2 to 5 minutes before checking again.
        </p>
      `;

      const copyBtn = card.querySelector(".anv-copy-btn");
      const linkInput = card.querySelector(".anv-link-input");
      copyBtn.addEventListener("click", () => {
        linkInput.select();
        navigator.clipboard.writeText(rawUrl);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy Link"), 2000);
      });

    } catch (err) {
      card.className = "anv-upload-card error";
      card.innerHTML = `
        <div class="anv-card-header">
          <span>${sanitizedName}</span>
          <span style="color: var(--danger);">&cross; Failed</span>
        </div>
        <p class="anv-error-msg">${err.message}</p>
      `;
    }
  }
});
