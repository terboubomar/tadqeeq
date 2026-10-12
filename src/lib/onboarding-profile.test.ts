import { describe, expect, test } from "bun:test";

import { companyProfileErrors, needsCompanyProfile, type CompanyProfileInput } from "./onboarding";

const valid: CompanyProfileInput = {
  legalName: "شركة المذاق الأول",
  crNumber: "1010123456",
  vatNumber: "",
  brandName: "المذاق",
  contactName: "ريم العتيبي",
  contactEmail: "reem@example.com",
  contactMobile: "0551234567",
};

describe("companyProfileErrors", () => {
  test("accepts complete details without a VAT number", () => {
    expect(companyProfileErrors(valid, true)).toEqual({});
  });

  test("checks a VAT number only when one is entered", () => {
    expect(companyProfileErrors({ ...valid, vatNumber: "300000000000003" }, true)).toEqual({});
    expect(companyProfileErrors({ ...valid, vatNumber: "12345" }, true).vatNumber).toBeDefined();
  });

  test("accepts Arabic-Indic digits", () => {
    expect(companyProfileErrors({ ...valid, crNumber: "١٠١٠١٢٣٤٥٦", contactMobile: "٠٥٥١٢٣٤٥٦٧" }, true)).toEqual({});
  });

  test("requires every other field and the logo", () => {
    const empty = { legalName: "", crNumber: "", vatNumber: "", brandName: "", contactName: "", contactEmail: "", contactMobile: "" };
    expect(Object.keys(companyProfileErrors(empty, false)).sort()).toEqual(
      ["brandName", "contactEmail", "contactMobile", "contactName", "crNumber", "legalName", "logo"].sort(),
    );
  });
});

describe("needsCompanyProfile", () => {
  const base = { status: "pending_details", role: "owner", isPlatformAdmin: false, legalName: null, crNumber: null };

  test("asks the owner or an admin of a new workspace with no company details", () => {
    expect(needsCompanyProfile(base)).toBe(true);
    expect(needsCompanyProfile({ ...base, role: "admin" })).toBe(true);
  });

  test("never asks invited members, active customers or platform admins", () => {
    expect(needsCompanyProfile({ ...base, role: "viewer" })).toBe(false);
    expect(needsCompanyProfile({ ...base, status: "active" })).toBe(false);
    expect(needsCompanyProfile({ ...base, status: "meeting_booked" })).toBe(false);
    expect(needsCompanyProfile({ ...base, isPlatformAdmin: true })).toBe(false);
  });

  test("stops asking once the company name and CR are saved", () => {
    expect(needsCompanyProfile({ ...base, legalName: "شركة", crNumber: "1010123456" })).toBe(false);
    expect(needsCompanyProfile({ ...base, legalName: "شركة", crNumber: null })).toBe(true);
  });
});
