declare module 'update-notifier' {
  interface Package {
    name: string
    version: string
  }

  interface NotifyOptions {
    defer?: boolean
    isGlobal?: boolean
    message?: string
  }

  interface UpdateInfo {
    current: string
    latest: string
    type: string
  }

  interface UpdateNotifier {
    update?: UpdateInfo
    notify(options?: NotifyOptions): void
  }

  interface Options {
    pkg: Package
    updateCheckInterval?: number
    shouldNotifyInNpmScript?: boolean
  }

  export default function updateNotifier(options: Options): UpdateNotifier
}
