import React, { useState } from 'react'
import { Button, Input, Toast, Typography } from '@douyinfe/semi-ui'
import { useMutation } from '@tanstack/react-query'
import { changePassword } from '@/services/account'

const { Text } = Typography

export const ChangePasswordTab: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      Toast.success('密码修改成功')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err: any) => {
      Toast.error(err?.message || '密码修改失败，请检查旧密码是否正确')
    },
  })

  function handleSubmit() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Toast.warning('请填写所有密码字段')
      return
    }
    if (newPassword !== confirmPassword) {
      Toast.error('两次输入的新密码不一致')
      return
    }
    if (newPassword.length < 8) {
      Toast.error('新密码长度不得少于 8 位')
      return
    }
    mutation.mutate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px', paddingTop: '8px' }}>
      <div>
        <Text style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          当前密码
        </Text>
        <Input
          mode="password"
          value={currentPassword}
          onChange={(val) => setCurrentPassword(val)}
          placeholder="请输入当前密码"
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div>
        <Text style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          新密码
        </Text>
        <Input
          mode="password"
          value={newPassword}
          onChange={(val) => setNewPassword(val)}
          placeholder="密码长度至少为 8 位"
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div>
        <Text style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          确认新密码
        </Text>
        <Input
          mode="password"
          value={confirmPassword}
          onChange={(val) => setConfirmPassword(val)}
          placeholder="请再次输入新密码"
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div style={{ marginTop: '8px' }}>
        <Button
          theme="solid"
          loading={mutation.isPending}
          onClick={handleSubmit}
          style={{ 
            borderRadius: '8px', 
            padding: '0 24px',
            fontWeight: 600
          }}
        >
          保存修改
        </Button>
      </div>
    </div>
  )
}
