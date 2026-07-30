// Validation utilities for input sanitization and validation
const validator = require('validator');

class Validators {
  static validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return validator.isEmail(email.trim());
  }

  static validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return regex.test(password);
  }

  static validatePhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    return /^[0-9]{10,15}$/.test(phone.replace(/\D/g, ''));
  }

  static validateName(name) {
    if (!name || typeof name !== 'string') return false;
    return /^[a-zA-Z\s'-]{2,50}$/.test(name.trim());
  }

  static validateRollNumber(rollNumber) {
    if (!rollNumber || typeof rollNumber !== 'string') return false;
    return /^[A-Z0-9]{1,10}$/.test(rollNumber.trim());
  }

  static validateClassName(className) {
    if (!className || typeof className !== 'string') return false;
    return /^[A-Za-z0-9]{1,10}$/.test(className.trim());
  }

  static sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return validator.trim(validator.escape(str));
  }

  static sanitizeEmail(email) {
    if (typeof email !== 'string') return '';
    return validator.normalizeEmail(email);
  }

  static validateSchoolName(name) {
    if (!name || typeof name !== 'string') return false;
    return /^[a-zA-Z0-9\s'-]{2,100}$/.test(name.trim());
  }

  static validateObjectId(id) {
    if (typeof id !== 'string') return false;
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  static validateAttendanceStatus(status) {
    return ['present', 'absent', 'late', 'leave'].includes(status);
  }

  static validatePercentage(value) {
    return typeof value === 'number' && value >= 0 && value <= 100;
  }
}

module.exports = Validators;
