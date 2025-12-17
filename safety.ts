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
const outputImage = document.querySelector("#output-image") as HTMLImageElement;

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

function formatSafetyAdjustments(adjustments: SafetyAdjustment[]): string {
  if (adjustments.length === 0) return "";

  return `
Safety adjustments were applied:

${adjustments
  .map((a) => `• "${a.original}" → "${a.replacement}"\n  Reason: ${a.reason}`)
  .join("\n")}
`;
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
  showLoading();
  outputImage.style.display = "none";
  setControlsDisabled(true);

  const risks = analyzePrompt(prompt);

  if (!risks.includes("NONE")) {
    const { rewrittenPrompt, adjustments } = rewritePromptSafelyWithLog(prompt);

    try {
      //statusEl.innerText = "Adjusting prompt for safety and retrying...";
      showLoadingAdjustments();
      await generateImage(rewrittenPrompt, apiKey);

      statusEl.innerHTML =
        `<div class="success-text">Image generated successfully (with safe adjustments)</div>` +
        formatSafetyAdjustmentsHTML(adjustments);

      /*

      const adjustmentSummary = formatSafetyAdjustments(adjustments);

     statusEl.innerText =
       "Image generated successfully (with safe adjustments)\n\n" +
       adjustmentSummary;

       */

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
    await generateImage(prompt, apiKey);
    //statusEl.innerText = "Image generated successfully.";
    statusEl.innerHTML = `<div class="success-text">Image generated successfully.</div>`;
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

async function generateImage(prompt: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateImages({
    model: "imagen-4.0-generate-001",
    prompt,
    config: {
      personGeneration: "ALLOW_ADULT",
       numberOfImages: 2,
      // outputMimeType: 'image/jpeg',
      // personGeneration: 'ALLOW_ADULT',
      // aspectRatio: '16:9',
      // imageSize: '1K',
    },
  });

  const images = response.generatedImages;
  if (images === undefined || images.length === 0) {
    throw new Error(
      "No images were generated. The prompt may have been blocked."
    );
  }

  const base64ImageBytes = images[0].image.imageBytes;
  const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
  outputImage.src = imageUrl;
  outputImage.style.display = "block";
}
