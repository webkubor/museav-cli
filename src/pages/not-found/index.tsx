import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuCompass } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'

export default function NotFoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-mg-bg-1 px-6">
      <div className="w-full max-w-sm rounded-lg border border-mg-border bg-card-bg p-8 text-center shadow-sm space-y-5">
        <div className="mx-auto w-14 h-14 rounded-lg bg-mg-fill-1 border border-mg-border flex items-center justify-center">
          <LuCompass size={26} className="text-mg-text-3" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-mg-text-1">{t('common.notFound.title')}</h1>
          <p className="text-sm text-mg-text-3 leading-relaxed">
            {t('common.notFound.desc')}
          </p>
        </div>
        <Button variant="brand" onClick={() => navigate('/', { replace: true })} className="w-full h-10 rounded-md font-semibold">
          {t('common.notFound.backHome')}
        </Button>
      </div>
    </div>
  )
}
