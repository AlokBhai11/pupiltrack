const mongoose = require('mongoose')

const homeworkSchema = new mongoose.Schema(
  {
    institute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'institutes',
      required: true,
      index: true,
    },
    className: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    dueDate: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
  },
  {
    timestamps: true,
    collection: 'homework',
  }
)

homeworkSchema.index({ institute: 1, className: 1, createdAt: -1 })

module.exports = mongoose.model('Homework', homeworkSchema)
