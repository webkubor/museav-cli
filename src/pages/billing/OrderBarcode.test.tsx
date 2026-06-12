import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { OrderBarcode } from './OrderBarcode'

describe('OrderBarcode', () => {
  it('renders a real barcode for the full order number', () => {
    render(<OrderBarcode value="WX202606100001" />)

    const wrapper = screen.getByTestId('order-barcode')
    expect(wrapper).toHaveAttribute('data-barcode-value', 'WX202606100001')
    expect(screen.getByLabelText('Order number barcode WX202606100001')).toBeInTheDocument()
    expect(within(wrapper).getByText('WX202606100001')).toBeInTheDocument()
  })
})
