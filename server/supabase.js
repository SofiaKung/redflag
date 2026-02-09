/**
 * Supabase integration for logging scam analyses and user feedback.
 *
 * All writes are fire-and-forget — they never block the API response.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */

import { createClient } from '@supabase/supabase-js';

let _client = null;

function getClient(env) {
  if (_client) return _client;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

/**
 * Log a completed analysis to Supabase (fire-and-forget).
 *
 * @param {object} data
 * @param {string} data.inputType - 'url' | 'text' | 'screenshot'
 * @param {string} [data.url]
 * @param {string} [data.text]
 * @param {string} [data.screenshotBase64] - raw base64 image data
 * @param {string} data.apiMode - 'agentic' | 'legacy'
 * @param {number} data.responseTimeMs
 * @param {object} data.result - full AnalysisResult
 * @param {string} [data.userCountryCode] - user's country code (e.g. 'US', 'TH')
 * @param {object} env - environment variables
 * @returns {Promise<string|null>} inserted row id, or null on failure
 */
export async function logAnalysis(data, env) {
  const supabase = getClient(env);
  if (!supabase) return null;

  try {
    const { result } = data;
    const verified = result?.linkMetadata?.verified;

    // Determine input type
    const inputType = data.inputType || (data.url ? 'url' : data.screenshotBase64 ? 'screenshot' : 'text');

    const row = {
      input_type: inputType,
      analyzed_url: data.url || null,
      input_text: data.text || null,
      risk_level: result?.riskLevel || null,
      risk_score: typeof result?.score === 'number' ? result.score : null,
      fraud_category: result?.category || null,
      detected_language: result?.detectedNativeLanguage || null,
      user_language: result?.userSystemLanguage || null,
      api_mode: data.apiMode || null,
      response_time_ms: data.responseTimeMs || null,
      registrar: verified?.registrar || null,
      domain_age: verified?.domainAge || null,
      server_country: verified?.serverCountry || null,
      registrant_org: verified?.registrantOrg || null,
      privacy_protected: verified?.privacyProtected || false,
      geo_mismatch: verified?.geoMismatch || false,
      homograph_attack: verified?.homographAttack || false,
      safe_browsing_threats: verified?.safeBrowsingThreats || [],
      scanned_text: result?.scannedText || null,
      user_country_code: data.userCountryCode || null,
      scam_country: verified?.serverCountry || null,
      full_result: result,
    };

    const { data: inserted, error } = await supabase
      .from('scam_analyses')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error('Supabase insert error:', error.message);
      return null;
    }

    const analysisId = inserted?.id;

    // Upload screenshot to storage if present
    if (data.screenshotBase64 && analysisId) {
      try {
        const buffer = Buffer.from(data.screenshotBase64, 'base64');
        const filePath = `${analysisId}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('screenshots')
          .upload(filePath, buffer, { contentType: 'image/jpeg', upsert: true });

        if (uploadError) {
          console.error('Screenshot upload error:', uploadError.message);
        } else {
          // Update row with screenshot path
          await supabase
            .from('scam_analyses')
            .update({ screenshot_path: filePath })
            .eq('id', analysisId);
        }
      } catch (uploadErr) {
        console.error('Screenshot upload failed:', uploadErr?.message);
      }
    }

    return analysisId;
  } catch (err) {
    console.error('Supabase logAnalysis error:', err?.message);
    return null;
  }
}

/**
 * Update user feedback for an analysis.
 *
 * @param {string} analysisId - UUID of the scam_analyses row
 * @param {string} feedback - 'correct' | 'incorrect'
 * @param {object} env
 * @returns {Promise<boolean>}
 */
export async function submitFeedback(analysisId, feedback, env) {
  const supabase = getClient(env);
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('scam_analyses')
      .update({
        user_feedback: feedback,
        feedback_at: new Date().toISOString(),
      })
      .eq('id', analysisId);

    if (error) {
      console.error('Supabase feedback error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase submitFeedback error:', err?.message);
    return false;
  }
}
