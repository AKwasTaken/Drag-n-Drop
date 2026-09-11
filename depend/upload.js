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
  const reviewBtn = document.getElementById("review-upload-btn");
  const stagedCountEl = document.getElementById("staged-count");

  const modal = document.getElementById("preview-modal");
  const modalPreviewList = document.getElementById("modal-preview-list");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalUploadBtn = document.getElementById("modal-upload-btn");

  let stagedFiles = [];
  let previewObjectUrls = [];

  // Load saved token from local storage
  tokenInput.value = localStorage.getItem("anvesha_pat") || "";
  tokenInput.addEventListener("input", () => {
    localStorage.setItem("anvesha_pat", tokenInput.value.trim());
  });

  // Browse dialog triggers
  dropTrigger.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      stageFiles(Array.from(e.target.files));
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
      stageFiles(Array.from(e.dataTransfer.files));
    }
  });

  // --- Staging -------------------------------------------------------------

  function stageFiles(files) {
    stagedFiles = stagedFiles.concat(files);
    refreshStagedUI();
  }

  function refreshStagedUI() {
    reviewBtn.disabled = stagedFiles.length === 0;
    stagedCountEl.hidden = stagedFiles.length === 0;
    stagedCountEl.textContent = String(stagedFiles.length);
  }

  function clearStaged() {
    stagedFiles = [];
    refreshStagedUI();
  }

  // Folder assignment logic
  function resolveTargetFolder(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    if (IMAGE_EXTS.includes(ext)) return "img";
    if (DOC_EXTS.includes(ext)) return "doc";
    return "file";
  }

  function isImageFile(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    return IMAGE_EXTS.includes(ext);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- Preview modal ----------------------------------------------------------

  function openPreviewModal() {
    modalPreviewList.innerHTML = "";
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls = [];

    stagedFiles.forEach((file, idx) => {
      const folder = resolveTargetFolder(file.name);
      const sanitizedName = file.name.replace(/\s+/g, "-");

      let mediaHtml;
      if (isImageFile(file.name)) {
        const url = URL.createObjectURL(file);
        previewObjectUrls.push(url);
        mediaHtml = `<img class="anv-preview-thumb" src="${url}" alt="${sanitizedName}" />`;
      } else {
        const ext = (file.name.split(".").pop() || "?").toUpperCase();
        mediaHtml = `<div class="anv-preview-file-icon">${ext}</div>`;
      }

      const item = document.createElement("div");
      item.className = "anv-preview-item";
      item.innerHTML = `
        ${mediaHtml}
        <div class="anv-preview-meta">
          <div class="anv-preview-name">${sanitizedName}</div>
          <div class="anv-preview-sub">${folder}/ &middot; ${formatBytes(file.size)}</div>
        </div>
        <button type="button" class="anv-preview-remove" data-idx="${idx}" aria-label="Remove file">&times;</button>
      `;
      modalPreviewList.appendChild(item);
    });

    modalPreviewList.querySelectorAll(".anv-preview-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        stagedFiles.splice(idx, 1);
        refreshStagedUI();
        if (stagedFiles.length === 0) {
          closePreviewModal();
        } else {
          openPreviewModal();
        }
      });
    });

    modal.hidden = false;
  }

  function closePreviewModal() {
    modal.hidden = true;
  }

  reviewBtn.addEventListener("click", () => {
    const token = tokenInput.value.trim();
    if (!token) {
      alert("Please enter a valid GitHub token before uploading.");
      tokenInput.focus();
      return;
    }
    if (stagedFiles.length === 0) return;
    openPreviewModal();
  });

  modalCancelBtn.addEventListener("click", () => {
    clearStaged();
    closePreviewModal();
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modalCancelBtn.click();
    }
  });

  modalUploadBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      alert("Please enter a valid GitHub token before uploading.");
      return;
    }

    const filesToUpload = stagedFiles.slice();
    clearStaged();
    closePreviewModal();

    for (const file of filesToUpload) {
      await uploadFile(file, token);
    }
  });

  // --- Actual GitHub commit ---------------------------------------------------

  async function uploadFile(file, token) {
    const folder = resolveTargetFolder(file.name);
    const sanitizedName = file.name.replace(/\s+/g, "-");
    const targetPath = `${folder}/${sanitizedName}`;

    const card = document.createElement("div");
    card.className = "anv-upload-card uploading";
    card.innerHTML = `
      <div class="anv-card-header">
        <span>${sanitizedName}</span>
        <span class="status-label">Uploading&hellip;</span>
      </div>
      <div class="anv-card-meta">${targetPath}</div>
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

      // Extract raw link returned directly by the API response
      const uploadData = await putRes.json();
      const rawUrl =
        uploadData.content?.download_url ||
        `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${targetPath}`;

      card.className = "anv-upload-card success";
      card.innerHTML = `
        <div class="anv-card-header">
          <span>${sanitizedName}</span>
          <span class="status-ok">Committed</span>
        </div>
        <div class="anv-card-meta">${targetPath}</div>
        <div class="anv-link-output">
          <input type="text" class="anv-link-input" value="${rawUrl}" readonly />
          <button class="anv-copy-btn">Copy link</button>
        </div>
        <p class="anv-delay-warning">
          May take a few minutes to appear on the raw CDN.
        </p>
      `;

      const copyBtn = card.querySelector(".anv-copy-btn");
      const linkInput = card.querySelector(".anv-link-input");
      copyBtn.addEventListener("click", () => {
        linkInput.select();
        navigator.clipboard.writeText(rawUrl);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy link"), 2000);
      });

    } catch (err) {
      card.className = "anv-upload-card error";
      card.innerHTML = `
        <div class="anv-card-header">
          <span>${sanitizedName}</span>
          <span class="status-fail">Failed</span>
        </div>
        <p class="anv-error-msg">${err.message}</p>
      `;
    }
  }
});
