import { GoogleGenAI } from "@google/genai";
import { PromptRisk, SafetyAdjustment } from "./type";

export function rewritePromptSafely(prompt: string): string {
  let rewritten = prompt;

  // Force adult clarification
  rewritten = rewritten.replace(
    /\bteenager\b|\bchild\b|\bgirl\b|\bboy\b/gi,
    "young woman"
  );

  // Reduce emotional vulnerability
  rewritten = rewritten.replace(
    /heartbreakingly|tragic|innocence|unshed tears|crying/gi,
    "calm and reflective"
  );

  // Tone down realism slightly
  rewritten = rewritten.replace(
    /8k|photorealistic|ultra realistic/gi,
    "high quality"
  );

  return rewritten;
}

function rewritePromptSafelyWithLog(prompt: string): {
  rewrittenPrompt: string;
  adjustments: SafetyAdjustment[];
} {
  let rewritten = prompt;
  const adjustments: SafetyAdjustment[] = [];

  const replacements = [
    {
      pattern: /\bteenager\b|\bchild\b|\bgirl\b|\bboy\b/gi,
      replacement: "adult woman",
      reason: "Image generation is restricted to adults only",
    },
    {
      pattern: /heartbreakingly|tragic|innocence|unshed tears|crying/gi,
      replacement: "calm and reflective",
      reason: "Emotionally vulnerable descriptions may be restricted",
    },
    {
      pattern: /8k|photorealistic|ultra realistic/gi,
      replacement: "high quality",
      reason: "Highly realistic human imagery may be restricted",
    },
  ];

  for (const rule of replacements) {
    const matches = rewritten.match(rule.pattern);
    if (matches) {
      matches.forEach((match) => {
        adjustments.push({
          original: match,
          replacement: rule.replacement,
          reason: rule.reason,
        });
      });

      rewritten = rewritten.replace(rule.pattern, rule.replacement);
    }
  }

  return { rewrittenPrompt: rewritten, adjustments };
}

export function analyzePrompt(prompt: string): PromptRisk[] {
  const risks: PromptRisk[] = [];
  const lower = prompt.toLowerCase();

  // Minor detection
  const minorKeywords = [
    "teenager",
    "child",
    "minor",
    "girl",
    "boy",
    "young boy",
    "young girl",
  ];

  if (minorKeywords.some((word) => lower.includes(word))) {
    risks.push("MINOR_REFERENCE");
  }

  // Photorealism + person
  const realismKeywords = [
    "photorealistic",
    "8k",
    "highly detailed",
    "realistic texture",
  ];

  const personKeywords = ["woman", "man", "person", "girl", "boy", "human"];

  if (
    realismKeywords.some((word) => lower.includes(word)) &&
    personKeywords.some((word) => lower.includes(word))
  ) {
    risks.push("PHOTOREALISTIC_PERSON");
  }

  // Emotional vulnerability
  const emotionalKeywords = [
    "tears",
    "crying",
    "heartbroken",
    "tragic",
    "innocence",
    "vulnerable",
  ];

  if (emotionalKeywords.some((word) => lower.includes(word))) {
    risks.push("EMOTIONAL_VULNERABILITY");
  }

  return risks.length ? risks : ["NONE"];
}

export function getSafetyMessage(risks: PromptRisk[]): string {
  if (risks.includes("MINOR_REFERENCE")) {
    return "Your prompt appears to describe a minor. Image generation is restricted to adults only. Please update the subject to be an adult.";
  }

  if (risks.includes("PHOTOREALISTIC_PERSON")) {
    return "Highly realistic images of people may be restricted. Please ensure the subject is clearly an adult or reduce photorealistic detail.";
  }

  if (risks.includes("EMOTIONAL_VULNERABILITY")) {
    return "Prompts describing emotional vulnerability may be restricted. Consider softening emotional language.";
  }

  return "Your prompt may violate image generation safety policies. Please revise and try again.";
}

export async function openApiKeyDialog() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    // This provides a fallback for environments where the dialog isn't available
    showStatusError(
      "API key selection is not available. Please configure the API_KEY environment variable."
    );
  }
}

// --- Functions ---
export function showStatusError(message: string) {
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
}

export const statusEl = document.querySelector("#status") as HTMLDivElement;

// --- DOM Element Selection ---
const promptEl = document.querySelector("#prompt-input") as HTMLTextAreaElement;
export const generateButton = document.querySelector(
  "#generate-button"
) as HTMLButtonElement;

const outputImages = document.querySelector("#output-images") as HTMLDivElement;
const imageCountSelect = document.querySelector(
  "#image-count"
) as HTMLSelectElement;

const lightbox = document.getElementById("lightbox")!;
const lightboxImage = document.getElementById(
  "lightbox-image"
) as HTMLImageElement;
const lightboxClose = document.getElementById("lightbox-close")!;

// --- State Variables ---
export let prompt = "";

// --- Event Listeners ---
promptEl.addEventListener("input", () => {
  prompt = promptEl.value;
});

function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  promptEl.disabled = disabled;
}

// -----------------------------
// UI Formatting
// -----------------------------
function formatSafetyAdjustmentsHTML(adjustments: SafetyAdjustment[]): string {
  if (!adjustments.length) return "";

  return `
    <div class="safety-box">
      <div class="safety-header">Safety adjustments applied</div>
      <ul class="safety-list">
        ${adjustments
          .map(
            (a) => `
          <li class="safety-item">
            <div class="safety-change">
              <span class="original">"${a.original}"</span>
              <span class="arrow">→</span>
              <span class="replacement">"${a.replacement}"</span>
            </div>
            <div class="safety-reason">${a.reason}</div>
          </li>
        `
          )
          .join("")}
      </ul>
    </div>
  `;
}

function showLoading() {
  statusEl.innerHTML = `
    <div class="loading-container">
      <span class="spinner"></span>
      <span class="loading-text">Generating image...</span>
    </div>
  `;
}

function showLoadingAdjustments() {
  statusEl.innerHTML = `
    <div class="loading-container">
      <span class="spinner"></span>
      <span class="loading-text">Adjusting prompt for safety and retrying...</span>
    </div>
  `;
}

export async function generate() {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    showStatusError("API key is not configured. Please add your API key.");
    await openApiKeyDialog();
    return;
  }

  //statusEl.innerText = "Generating image...";

  //outputImage.style.display = "none";
  outputImages.innerHTML = "";
  setControlsDisabled(true);

  const risks = analyzePrompt(prompt);

  if (!risks.includes("NONE")) {
    const { rewrittenPrompt, adjustments } = rewritePromptSafelyWithLog(prompt);

    try {
      //showLoadingAdjustments();
      if (adjustments.length) {
        showLoadingAdjustments();
      } else {
        showLoading();
      }
      await generateImage(rewrittenPrompt, apiKey);

      // Only show "with safe adjustments" if there are actual adjustments
      if (adjustments.length) {
        statusEl.innerHTML =
          `<div class="success-text">Image generated successfully (with safe adjustments)</div>` +
          formatSafetyAdjustmentsHTML(adjustments);
      } else {
        statusEl.innerHTML = `<div class="success-text">Image generated successfully.</div>`;
      }

      return;
    } catch (e) {
      /*  showStatusError(
        "Image generation failed after applying safety adjustments. Please revise your prompt."
      ); */

      showStatusError(
        e instanceof Error
          ? e.message
          : "Image generation failed after applying safety adjustments. Please revise your prompt."
      );
      return;
    } finally {
      setControlsDisabled(false);
    }
  }

  try {
    showLoading();
    console.log("No adjustments");
    await generateImage(prompt, apiKey);
    //statusEl.innerText = "Image generated successfully.";
    statusEl.innerHTML = `<div class="success-text">Image generated successfully..</div>`;
  } catch (e) {
    console.error("Image generation failed:", e);
    const errorMessage =
      e instanceof Error ? e.message : "An unknown error occurred.";

    let userFriendlyMessage = `Error: ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === "string") {
      if (errorMessage.includes("Requested entity was not found.")) {
        userFriendlyMessage =
          "Model not found. This can be caused by an invalid API key or permission issues. Please check your API key.";
        shouldOpenDialog = true;
      } else if (
        errorMessage.includes("API_KEY_INVALID") ||
        errorMessage.includes("API key not valid") ||
        errorMessage.toLowerCase().includes("permission denied")
      ) {
        userFriendlyMessage =
          "Your API key is invalid. Please add a valid API key.";
        shouldOpenDialog = true;
      }
    }

    showStatusError(userFriendlyMessage);

    if (shouldOpenDialog) {
      await openApiKeyDialog();
    }
  } finally {
    setControlsDisabled(false);
  }
}

function downloadImage(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function generateImage(prompt: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });

  const numberOfImages = Number(imageCountSelect.value) || 1;
  console.log("Generating", numberOfImages, "images");
  console.log("imageCountSelect.value", imageCountSelect.value);

  const response = await ai.models.generateImages({
    model: "imagen-4.0-generate-001",
    prompt,
    config: {
      numberOfImages, // ← change as needed
    },
  });

  if (!response.generatedImages?.length) {
    throw new Error("No images were generated.");
  }

  //  delegate rendering to a dedicated function
  renderGeneratedImages(response.generatedImages);
}

function renderGeneratedImages(generatedImages: any[]) {
  outputImages.innerHTML = "";

  generatedImages.forEach((generated, index) => {
    const imgData = generated.image;
    const imageUrl = `data:${imgData.mimeType};base64,${imgData.imageBytes}`;

    // Wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "image-card";

    // Image element
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = `Generated image ${index + 1}`;
    img.loading = "lazy"; // ✅ Lazy loading
    img.className = "generated-image";

    // 🔍 Open lightbox on click
    img.addEventListener("click", () => openLightbox(imageUrl));

    // Download button
    const downloadBtn = document.createElement("button");
    downloadBtn.className = "download-btn";
    downloadBtn.innerText = "Download";

    downloadBtn.addEventListener("click", () => {
      downloadImage(imageUrl, `generated-image-${index + 1}.png`);
    });

    wrapper.appendChild(img);
    wrapper.appendChild(downloadBtn);
    outputImages.appendChild(wrapper);
  });
}

function openLightbox(src: string) {
  lightboxImage.src = src;
  lightbox.classList.remove("hidden");

  // Disable page scrolling
  document.body.style.overflow = "hidden";
}

// Close lightbox
function closeLightbox() {
  lightbox.classList.add("hidden");

  // Re-enable page scrolling
  document.body.style.overflow = "";
}

/* lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
}); */

// Event listeners
lightboxClose.addEventListener("click", closeLightbox);
lightbox
  .querySelector(".lightbox-overlay")!
  .addEventListener("click", closeLightbox);
