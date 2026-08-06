const mongoose = require('mongoose')

const feeChargeSchema = new mongoose.Schema(
  {
    institute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['admission', 'tuition', 'fine', 'uniform', 'stationery', 'transport', 'other'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // "one_time" charges (e.g. admission fee) are only auto-suggested once per
    // student, ever. "monthly" charges (e.g. tuition) recur and are matched
    // against applicableMonths.
    frequency: {
      type: String,
      enum: ['one_time', 'monthly'],
      required: true,
      default: 'monthly',
    },
    // For monthly charges: which billing months ("YYYY-MM") this charge applies
    // to. An empty array means "every month" (e.g. a standing tuition fee).
    applicableMonths: {
      type: [String],
      default: [],
    },
    // Which classes this charge applies to. An empty array means "all classes".
    applicableClasses: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
  },
  {
    timestamps: true,
    collection: 'fee_charges',
  }
)

feeChargeSchema.index({ institute: 1, isActive: 1 })

module.exports = mongoose.model('FeeCharge', feeChargeSchema)
