'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Document {
  id: string
  nom: string
  fichier_path: string
  taille: number | null
  type_mime: string | null
  created_at: string
}

interface DocumentManagerProps {
  entityType: 'reception' | 'matiere_premiere' | 'produit_fini'
  entityId: string
  label?: string
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function getFileIcon(mime: string | null): string {
  if (!mime) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📕'
  if (mime.includes('word')) return '📝'
  return '📄'
}

export default function DocumentManager({ entityType, entityId, label = 'Documents' }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
    setDocuments(data || [])
  }, [entityType, entityId])

  useEffect(() => {
    if (entityId) load()
  }, [entityId, load])

  async function uploadFiles(files: FileList | File[]) {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()

    for (const file of fileArray) {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${entityType}/${entityId}/${timestamp}_${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file)

      if (uploadError) {
        alert(`Erreur upload "${file.name}": ${uploadError.message}`)
        continue
      }

      await supabase.from('documents').insert({
        entity_type: entityType,
        entity_id: entityId,
        nom: file.name,
        fichier_path: path,
        taille: file.size,
        type_mime: file.type || null,
        uploaded_by: user?.id || null,
      })
    }

    setUploading(false)
    load()
  }

  async function downloadFile(doc: Document) {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.fichier_path, 3600)

    if (error || !data?.signedUrl) {
      alert('Erreur lors du téléchargement')
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  async function removeFile(doc: Document) {
    if (!confirm(`Supprimer "${doc.nom}" ?`)) return

    await supabase.storage.from('documents').remove([doc.fichier_path])
    await supabase.from('documents').delete().eq('id', doc.id)
    load()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>

      {/* Zone d'upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        {uploading ? (
          <p className="text-sm text-gray-500">⏳ Upload en cours...</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-2">
              Glissez-déposez des fichiers ici ou
            </p>
            <label className="cursor-pointer inline-block bg-primary text-white px-4 py-1.5 rounded-lg text-sm hover:bg-primary-light transition">
              Parcourir
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                className="hidden"
                onChange={(e) => e.target.files && uploadFiles(e.target.files)}
              />
            </label>
            <p className="text-xs text-gray-400 mt-2">PDF, images, Word — Max 10 Mo par fichier</p>
          </>
        )}
      </div>

      {/* Liste des documents */}
      {documents.length > 0 && (
        <div className="mt-3 space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 group">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg">{getFileIcon(doc.type_mime)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <p className="text-xs text-gray-400">
                    {formatSize(doc.taille)}
                    {doc.created_at && ` · ${new Date(doc.created_at).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => downloadFile(doc)}
                  className="text-primary hover:underline text-sm"
                  title="Télécharger"
                >
                  ⬇️
                </button>
                <button
                  onClick={() => removeFile(doc)}
                  className="text-red-500 hover:underline text-sm"
                  title="Supprimer"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
