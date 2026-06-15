// Extraction d'un bon de livraison (PDF ou image) via l'API Claude.
// Reçoit le fichier en base64, renvoie les données structurées du bon.

interface ExtractRequest {
  fileBase64: string
  mediaType: string // application/pdf, image/jpeg, image/png, image/webp
}

const TOOL = {
  name: 'enregistrer_bon',
  description: "Enregistre les données extraites d'un bon de livraison / bon de réception fournisseur.",
  input_schema: {
    type: 'object',
    properties: {
      fournisseur: { type: 'string', description: "Nom de la société fournisseur qui émet le bon (ex: Alveus GmbH)." },
      date_livraison: { type: 'string', description: 'Date de livraison au format YYYY-MM-DD. Convertir depuis DD.MM.YYYY si besoin.' },
      numero_bl: { type: 'string', description: 'Numéro du bon de livraison (ex: IF44710).' },
      numero_commande: { type: ['string', 'null'], description: 'Numéro de commande si présent (ex: SO29291), sinon null.' },
      lignes: {
        type: 'array',
        description: 'Une entrée par ligne article du tableau.',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: "Code article / référence (colonne Article), ex: 82709." },
            description: { type: 'string', description: 'Désignation du produit.' },
            quantite: { type: 'number', description: 'Quantité EXPÉDIÉE / livrée (PAS la quantité commandée).' },
            unite: { type: 'string', description: "Unité indiquée sur le bon (ex: Unit)." },
            numero_lot: { type: ['string', 'null'], description: "Numéro de lot (ex: WO83649). Souvent au format LOT/DLUO." },
            date_peremption: { type: ['string', 'null'], description: 'Date de péremption / à consommer avant, au format YYYY-MM-DD.' },
          },
          required: ['code', 'description', 'quantite'],
        },
      },
    },
    required: ['fournisseur', 'date_livraison', 'numero_bl', 'lignes'],
  },
} as const

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: "Clé API Anthropic non configurée (ANTHROPIC_API_KEY). Ajoutez-la dans les variables d'environnement." },
      { status: 500 },
    )
  }

  let body: ExtractRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Corps de requête invalide.' }, { status: 400 })
  }

  const { fileBase64, mediaType } = body
  if (!fileBase64 || !mediaType) {
    return Response.json({ error: 'Fichier manquant.' }, { status: 400 })
  }

  // Bloc document pour les PDF, bloc image pour les photos.
  const fileBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'enregistrer_bon' },
        messages: [
          {
            role: 'user',
            content: [
              fileBlock,
              {
                type: 'text',
                text:
                  "Voici un bon de livraison fournisseur. Extrais précisément toutes les informations et appelle l'outil enregistrer_bon.\n" +
                  "- Pour chaque ligne article, utilise la quantité EXPÉDIÉE (livrée), pas la quantité commandée.\n" +
                  "- Le champ lot est souvent au format « WO83649/16.03.2028 » : sépare le numéro de lot (WO83649) et la date de péremption (16.03.2028 → 2028-03-16).\n" +
                  "- Convertis toutes les dates au format YYYY-MM-DD.\n" +
                  "- N'invente aucune valeur : laisse null si une information est absente.",
              },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return Response.json(
        { error: `Erreur API Claude (${res.status}) : ${errText.slice(0, 500)}` },
        { status: 502 },
      )
    }

    const data = await res.json()
    const toolUse = (data.content || []).find((c: { type: string }) => c.type === 'tool_use')
    if (!toolUse) {
      return Response.json({ error: "Aucune donnée n'a pu être extraite du document." }, { status: 422 })
    }

    return Response.json({ bon: toolUse.input })
  } catch (e) {
    return Response.json(
      { error: `Erreur lors de l'extraction : ${e instanceof Error ? e.message : 'inconnue'}` },
      { status: 500 },
    )
  }
}
