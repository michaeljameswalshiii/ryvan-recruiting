import pptxgen from "pptxgenjs";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ToolContext, ToolParams, ToolResult } from "./types";

export const GENERATE_PRESENTATION_TOOL_NAME = "generate_presentation";
export const GENERATE_PRESENTATION_TOOL_DESCRIPTION =
  "Create a downloadable PowerPoint presentation. Pass slides as JSON [{title, body, bullets}] or a markdown outline.";

export const GENERATE_IMAGE_TOOL_NAME = "generate_image";
export const GENERATE_IMAGE_TOOL_DESCRIPTION =
  "Generate a new image or edit an uploaded image using the configured image provider. Returns a downloadable PNG.";

function addGeneratedFile(
  context: ToolContext,
  file: { fileName: string; mimeType: string; contentBase64: string; sizeBytes: number; format: string }
) {
  context.generatedFiles ||= [];
  context.generatedFiles.push(file);
}

function parseSlides(raw: unknown): Array<{ title: string; body?: string; bullets?: string[] }> {
  if (Array.isArray(raw)) return raw as Array<{ title: string; body?: string; bullets?: string[] }>;
  const text = String(raw || "").trim();
  if (!text) return [];
  const sections = text.split(/\n(?=#\s)/g);
  return sections.map((section, index) => {
    const lines = section.split(/\r?\n/).filter(Boolean);
    const title = lines[0]?.replace(/^#+\s*/, "").trim() || `Slide ${index + 1}`;
    const bullets = lines.slice(1).map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
    return { title, bullets };
  });
}

export async function executeGeneratePresentation(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  const p = params as Record<string, unknown>;
  const slides = parseSlides(p.slides || p.content || p.outline || p.query);
  if (!slides.length) return { success: false, error: "slides or an outline is required" };
  if (slides.length > 50) return { success: false, error: "A presentation may contain at most 50 slides" };

  try {
    const pptx = new pptxgen();
    pptx.author = "Trio Recruiting AI";
    pptx.subject = String(p.subject || "Generated presentation");
    pptx.title = String(p.title || slides[0]?.title || "Presentation");
    pptx.company = "Trio Recruiting";
    pptx.layout = "LAYOUT_WIDE";
    for (const slideData of slides) {
      const slide = pptx.addSlide();
      slide.background = { color: "F8FAFC" };
      slide.addText(slideData.title || "Untitled", {
        x: 0.65, y: 0.55, w: 12, h: 0.55, fontFace: "Aptos Display", fontSize: 27,
        bold: true, color: "0F172A", margin: 0,
      });
      const bullets = slideData.bullets?.length
        ? slideData.bullets
        : String(slideData.body || "").split(/\r?\n/).filter(Boolean);
      if (bullets.length) {
        slide.addText(bullets.map((text) => ({ text, options: { bullet: { indent: 18 } } })), {
          x: 0.9, y: 1.45, w: 11.2, h: 4.8, fontSize: 20, color: "334155",
          breakLine: true, paraSpaceAfter: 14, valign: "top", margin: 0.05,
        });
      }
      slide.addShape(pptx.ShapeType.line, { x: 0.65, y: 7.05, w: 12, h: 0, line: { color: "CBD5E1", width: 1 } });
      slide.addText("Trio Recruiting", { x: 0.65, y: 7.12, w: 3, h: 0.2, fontSize: 8, color: "64748B", margin: 0 });
    }
    const buffer = Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as Buffer);
    const fileName = String(p.file_name || p.fileName || "trio-presentation.pptx").replace(/[^a-zA-Z0-9._-]/g, "-");
    const finalName = fileName.toLowerCase().endsWith(".pptx") ? fileName : `${fileName}.pptx`;
    addGeneratedFile(context, { fileName: finalName, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", contentBase64: buffer.toString("base64"), sizeBytes: buffer.byteLength, format: "pptx" });
    return { success: true, data: { status: "generated", fileName: finalName, format: "pptx", sizeBytes: buffer.byteLength, message: `Presentation ready: ${finalName}.` }, metadata: { generatedFile: true, format: "pptx" } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Presentation generation failed" };
  }
}

export async function executeGenerateImage(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  const p = params as Record<string, unknown>;
  const prompt = String(p.prompt || p.query || "").trim();
  if (!prompt) return { success: false, error: "prompt is required" };
  const imageBase64 = typeof p.image_base64 === "string" ? p.image_base64 : "";
  const [width, height] = String(p.size || "1024x1024").split("x").map((n) => Number(n) || 1024);
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  const client = new BedrockRuntimeClient({ region });
  const taskType = imageBase64 ? "IMAGE_VARIATION" : "TEXT_IMAGE";
  const payload = imageBase64
    ? { taskType, imageVariationParams: { text: prompt, image: imageBase64, similarityStrength: Number(p.similarity_strength || 0.7) }, imageGenerationConfig: { numberOfImages: 1, width, height, cfgScale: 8 } }
    : { taskType, textToImageParams: { text: prompt }, imageGenerationConfig: { numberOfImages: 1, width, height, cfgScale: 8 } };
  try {
    const result = await client.send(new InvokeModelCommand({ modelId: String(p.model || "amazon.titan-image-generator-v2:0"), contentType: "application/json", accept: "application/json", body: Buffer.from(JSON.stringify(payload)) }));
    const json = JSON.parse(new TextDecoder().decode(result.body));
    const image = json?.images?.[0];
    if (!image) return { success: false, error: "Amazon Bedrock returned no image data" };
    const bytes = Buffer.from(image, "base64");
  const fileName = String(p.file_name || "trio-image.png").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/\.png$/i, "") + ".png";
  addGeneratedFile(context, { fileName, mimeType: "image/png", contentBase64: image, sizeBytes: bytes.byteLength, format: "png" });
  return { success: true, data: { status: "generated", fileName, format: "png", sizeBytes: bytes.byteLength, message: `Image ready: ${fileName}.` }, metadata: { generatedFile: true, format: "png", edited: Boolean(imageBase64) } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? `Bedrock image generation failed: ${error.message}` : "Bedrock image generation failed" };
  }
}
