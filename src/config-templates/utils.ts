// Utility functions for config templates

/**
 * Processes a configuration template by replacing placeholders with actual values
 *
 * @param template - The template string with {{PLACEHOLDER}} placeholders
 * @param replacements - Object mapping placeholder names (without {{}}) to their values
 * @returns The processed template with all placeholders replaced
 */
export function processConfigTemplate(
  template: string,
  replacements: Record<string, string | number | boolean>
): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value));
  }
  return result;
}
