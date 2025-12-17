/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {

  showStatusError,
  generate,
  generateButton,
  prompt,
} from "./safety.ts";

// Fix: Define and use AIStudio interface for window.aistudio to resolve type conflict.
// Define the aistudio property on the window object for TypeScript
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

generateButton.addEventListener("click", () => {
  if (!prompt.trim()) {
    showStatusError("Please enter a prompt to generate an image.");
    return;
  }
  generate();
});
