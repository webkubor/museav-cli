import { useState, useEffect } from 'react'
import FingerprintJS from '@fingerprintjs/fingerprintjs'

export function useFingerprint() {
  const [visitorId, setVisitorId] = useState<string | null>(null)

  useEffect(() => {
    FingerprintJS.load()
      .then(fp => fp.get())
      .then(result => setVisitorId(result.visitorId))
  }, [])

  return visitorId
}
