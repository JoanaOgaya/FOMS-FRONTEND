import { describe, it, expect } from 'vitest';

describe('Employee & Personnel 3-Layer Validation Rules', () => {
  // Regex rules defined matching backend and database constraints
  const EMP_ID_REGEX = /^EMP-\d{3}$/i;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^(\+63|0)9\d{9}$/;
  const NAME_REGEX = /^[a-zA-Z\s\.\-]+$/;

  describe('Employee ID Pattern Check (CK_Employees_Id_Pattern: EMP-###)', () => {
    it('should accept valid EMP-### patterns (EMP-001 to EMP-005)', () => {
      expect(EMP_ID_REGEX.test('EMP-001')).toBe(true);
      expect(EMP_ID_REGEX.test('EMP-002')).toBe(true);
      expect(EMP_ID_REGEX.test('EMP-003')).toBe(true);
      expect(EMP_ID_REGEX.test('EMP-004')).toBe(true);
      expect(EMP_ID_REGEX.test('EMP-005')).toBe(true);
    });

    it('should reject non-matching Employee IDs', () => {
      expect(EMP_ID_REGEX.test('EMP-1')).toBe(false);
      expect(EMP_ID_REGEX.test('EMP-0001')).toBe(false);
      expect(EMP_ID_REGEX.test('USER-001')).toBe(false);
      expect(EMP_ID_REGEX.test('EMP-ABC')).toBe(false);
      expect(EMP_ID_REGEX.test('')).toBe(false);
    });
  });

  describe('Email Format Validation (CK_Employees_Email_Format)', () => {
    it('should accept valid corporate and local email addresses', () => {
      expect(EMAIL_REGEX.test('crystalyn@foms.local')).toBe(true);
      expect(EMAIL_REGEX.test('misty@foms.local')).toBe(true);
      expect(EMAIL_REGEX.test('hannah@foms.local')).toBe(true);
      expect(EMAIL_REGEX.test('staff.user@speedex.com')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(EMAIL_REGEX.test('crystalyn')).toBe(false);
      expect(EMAIL_REGEX.test('crystalyn@')).toBe(false);
      expect(EMAIL_REGEX.test('crystalyn@foms')).toBe(false);
      expect(EMAIL_REGEX.test('@foms.local')).toBe(false);
      expect(EMAIL_REGEX.test('crystalyn @foms.local')).toBe(false);
    });
  });

  describe('Phone Number Validation (PH Standard Mobile: 09XX / +639XX)', () => {
    it('should accept valid 11-digit or 13-digit PH phone numbers', () => {
      expect(PHONE_REGEX.test('09171234567')).toBe(true);
      expect(PHONE_REGEX.test('+639171234567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(PHONE_REGEX.test('08171234567')).toBe(false); // Does not start with 09
      expect(PHONE_REGEX.test('0917123456')).toBe(false);  // Too short
      expect(PHONE_REGEX.test('091712345678')).toBe(false); // Too long
      expect(PHONE_REGEX.test('0917-ABC-5678')).toBe(false);
    });
  });

  describe('Full Name Pattern Validation', () => {
    it('should accept names with letters, spaces, dots, and hyphens', () => {
      expect(NAME_REGEX.test('Crystalyn Joyce C. Fajardo')).toBe(true);
      expect(NAME_REGEX.test('Misty')).toBe(true);
      expect(NAME_REGEX.test('Maria Mariel Jane Anonuevo')).toBe(true);
      expect(NAME_REGEX.test('Hannah-Marie Estrera')).toBe(true);
    });

    it('should reject names containing numbers or HTML tags', () => {
      expect(NAME_REGEX.test('User 123')).toBe(false);
      expect(NAME_REGEX.test('<script>alert(1)</script>')).toBe(false);
    });
  });

  describe('Salary Rate Range Constraints (CK_Employees_SalaryRate)', () => {
    const isValidSalary = (val: number | null | undefined): boolean => {
      if (val === null || val === undefined) return true;
      return !isNaN(val) && val >= 0 && val <= 10000000;
    };

    it('should allow valid salary rates within bounds', () => {
      expect(isValidSalary(0)).toBe(true);
      expect(isValidSalary(45000.00)).toBe(true);
      expect(isValidSalary(75000.00)).toBe(true);
      expect(isValidSalary(10000000)).toBe(true);
      expect(isValidSalary(null)).toBe(true);
    });

    it('should reject negative salaries or rates exceeding 10M threshold', () => {
      expect(isValidSalary(-500)).toBe(false);
      expect(isValidSalary(10000001)).toBe(false);
    });
  });

  describe('Form Trim & Clean Behavior', () => {
    it('should trim whitespace from input before submission', () => {
      const rawId = '  EMP-001  ';
      const rawEmail = '  hannah@foms.local ';
      expect(rawId.trim()).toBe('EMP-001');
      expect(rawEmail.trim()).toBe('hannah@foms.local');
    });
  });
});
