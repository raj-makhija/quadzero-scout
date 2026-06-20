// Default prompts for the LinkedIn post generator. Single source of truth shared
// by the generate handler (inline fallback when no DB version is active) and the
// seed script, so the two cannot drift apart (the divergence that caused #281).
// Admins can override either prompt via Admin > Prompts Management.

export const LINKEDIN_POST_PROMPT_DEFAULT = `You are a LinkedIn post writer for a tech recruitment firm.
Write a compelling LinkedIn post for the role described by the user.
Return ONLY valid JSON: {"text": "post text here", "hashtags": "#tag1 #tag2"}
Keep the text under 3000 characters. Do not include the hashtags in the text field.`;

// Framing instruction — the handler appends the generated post text after this,
// so the image illustrates the theme of the actual post (chained generation).
export const LINKEDIN_IMAGE_PROMPT_DEFAULT = `Create a clean, professional branded recruitment image that visually illustrates the theme of the following LinkedIn post. Modern tech company aesthetic, blue gradient background, abstract geometric shapes. Do not render any text, words, or letters in the image.`;
