import { PipelineStageError } from "../../../shared/src/error"

const DEFAULT_SARVAM_URL = "https://api.sarvam.ai/speech-to-text"
const DEFAULT_SARVAM_MODEL = "saaras:v3"

/**
 * HIPAA Compliance: Validate that external endpoints use HTTPS to ensure PHI is encrypted in transit.
 */
function validateHttpsUrl(url: string, serviceName: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") {
      throw new PipelineStageError(
        "configuration_error",
        `SECURITY ERROR: ${serviceName} endpoint must use HTTPS for HIPAA compliance. ` +
        `Received: ${parsed.protocol}//${parsed.host}`,
        false,
      )
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new PipelineStageError("configuration_error", `Invalid ${serviceName} URL: ${url}`, false)
    }
    throw error
  }
}

export async function transcribeWavBuffer(buffer: Buffer, filename: string, apiKey?: string): Promise<string> {
  const sarvamUrl = process.env.SARVAM_API_URL || DEFAULT_SARVAM_URL
  const sarvamModel = process.env.SARVAM_MODEL || DEFAULT_SARVAM_MODEL

  // Validate HTTPS before sending any PHI
  validateHttpsUrl(sarvamUrl, "Sarvam API")
  
  const key = apiKey || process.env.SARVAM_API_KEY
  if (!key) {
    throw new PipelineStageError(
      "configuration_error",
      "Missing SARVAM_API_KEY. Please configure your API key in your environment.",
      false,
    )
  }

  const formData = new FormData()
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/wav" })
  formData.append("file", blob, filename)
  formData.append("model", sarvamModel)

  const response = await fetch(sarvamUrl, {
    method: "POST",
    headers: {
      "api-subscription-key": key,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new PipelineStageError("api_error", `Transcription failed: ${response.status} ${errorText}`, true, {
      status: response.status,
      provider: "sarvam",
    })
  }

  const result = (await response.json()) as { transcript?: string }
  return result.transcript?.trim() ?? ""
}
