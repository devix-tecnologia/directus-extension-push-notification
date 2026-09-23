const FALLBACK_ICON = "/admin/favicon.ico";

interface IconSource {
  notification_id?: string | null;
  icon?: string | null;
  icon_url?: string | null;
}

/**
 * Precedência: `icon` > `icon_url` > fallback.
 *
 * O arquivo do Directus passa pelo endpoint, que o serve como proxy — o browser
 * busca o ícone sem credenciais e `/assets/{id}` responderia 403. A URL externa
 * vai direto: desviá-la pelo endpoint custaria um hop e uma consulta ao banco
 * sem poupar o cliente de alcançar o host externo.
 *
 * @see docs/RDT/rdt-001-icone-externo-url-direta-no-payload.md
 */
export function resolveIconUrl({
  notification_id,
  icon,
  icon_url,
}: IconSource): string {
  if (icon && notification_id) {
    return `/push-notification/icon/${notification_id}`;
  }

  return icon_url || FALLBACK_ICON;
}
