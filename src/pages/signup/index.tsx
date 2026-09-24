import { Navigate, useLocation } from 'react-router-dom'

/** Both markets enter through their login flow; preserve referral/invitation context. */
export default function SignupPage() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/login', search: location.search }} replace />
}
