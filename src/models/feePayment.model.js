const mongoose = require('mongoose')

const feePaymentSchema = new mongoose.Schema(
  {
    institute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'students',
      required: true,
      index: true,
    },
    // Snapshot of which charges made up this payment, captured at payment
    // time (not a live reference) so historical receipts stay accurate even
    // if the fee structure is edited later. `month` distinguishes which
    // billing month a recurring line item (e.g. Tuition Fee) belongs to when
    // a payment covers a range of months; null for one-time charges.
    charges: {
      type: [
        {
          name: String,
          category: String,
          amount: Number,
          month: String,
        },
      ],
      default: [],
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // Which billing month this payment covers, e.g. "2026-08"
    forMonth: {
      type: String,
      required: true,
      trim: true,
    },
    // If this payment covers a range of months (e.g. Apr-Jun), the last
    // month in that range. Blank means the payment is for forMonth only.
    toMonth: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'online', 'cheque', 'card', 'other'],
      default: 'cash',
    },
    remarks: {
      type: String,
      maxlength: 300,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
  },
  {
    timestamps: true,
    collection: 'fee_payments',
  }
)

feePaymentSchema.index({ institute: 1, student: 1, paymentDate: -1 })

module.exports = mongoose.model('FeePayment', feePaymentSchema)
