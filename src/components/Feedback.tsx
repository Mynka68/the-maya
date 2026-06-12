'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ConfirmState {
  message: string
  resolve: (ok: boolean) => void
}

interface FeedbackContextValue {
  toast: (type: ToastType, message: string) => void
  confirm: (message: string) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback doit être utilisé dans <FeedbackProvider>')
  return ctx
}

const toastStyles: Record<ToastType, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-gray-800 text-white',
}

const toastIcons: Record<ToastType, string> = {
  success: '✅',
  error: '⚠️',
  info: 'ℹ️',
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const idRef = useRef(0)

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, type === 'error' ? 8000 : 4000)
  }, [])

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>(resolve => {
      setConfirmState({ message, resolve })
    })
  }, [])

  function answerConfirm(ok: boolean) {
    confirmState?.resolve(ok)
    setConfirmState(null)
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md print:hidden">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`${toastStyles[t.type]} rounded-lg shadow-lg px-4 py-3 text-sm flex items-start gap-2 animate-[fadeIn_0.2s_ease-out]`}
          >
            <span>{toastIcons[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="opacity-70 hover:opacity-100 ml-2"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <p className="text-sm text-gray-800 whitespace-pre-line">{confirmState.message}</p>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => answerConfirm(false)}
                className="bg-gray-200 px-4 py-2 rounded-lg text-sm hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={() => answerConfirm(true)}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}
