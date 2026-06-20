// Default prompts for the LinkedIn post generator. Single source of truth shared
// by the generate handler (inline fallback when no DB version is active) and the
// seed script, so the two cannot drift apart (the divergence that caused #281).
// Admins can override either prompt via Admin > Prompts Management.

export const LINKEDIN_POST_PROMPT_DEFAULT = `You are a LinkedIn post writer for a tech recruitment firm.
Write a compelling LinkedIn post for the role described by the user.
Return ONLY valid JSON: {"text": "post text here", "hashtags": "#tag1 #tag2"}
Keep the text under 3000 characters. Do not include the hashtags in the text field.`;

// Infographic spec built from the requirement's job description. The handler fills
// {{raw_job_description}} with the JD before sending to a Gemini image model (which,
// unlike Imagen, renders legible text). Admins can fully rewrite this in Admin > Prompts.
export const LINKEDIN_IMAGE_PROMPT_DEFAULT = `Create a clean, modern flat-design recruitment infographic (landscape 16:9) from the job description below. Light near-white background with a faint pale-blue circuit texture and a thin orange-to-blue-to-green gradient bar across the top. Header: a navy rounded banner with the job title, plus location and experience if present. Left column "Key Responsibilities": the 4-5 most important, each a short phrase with a small fitting icon. Right column "Must-Have Skills": the top 5-7 as rounded pill badges. Add a "Good to Have" section only if the JD lists nice-to-haves. Bottom: a friendly flat illustration of a diverse team, and a contact box with the application email if one is given. Render all text crisply, legibly, and correctly spelled; never overflow a box.

--- JOB DESCRIPTION ---
{{raw_job_description}}`;
