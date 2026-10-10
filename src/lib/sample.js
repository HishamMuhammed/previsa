// Seed application, deliberately inconsistent: live errors for the demo,
// plus enough clean documents to make the report look credible.
// Generated from sample.json — keep that file as the readable source of truth.

export const SAMPLE_APPLICATION = {
  "meta": {
    "applicant": "Jose Menon",
    "destination": "France (Schengen short-stay)",
    "dateOrder": "dmy",
    "submissionDate": "2026-11-30",
    "priorTrips": [
      {
        "from": "2026-03-02",
        "to": "2026-03-22",
        "label": "Italy"
      },
      {
        "from": "2026-09-05",
        "to": "2026-09-19",
        "label": "Germany"
      }
    ],
    "dateNote": "Slash-form dates on statements and bookings are read as DD/MM/YYYY. Where both readings are valid and different, Preflight flags it rather than guessing."
  },
  "trip": {
    "arrivalDate": "2027-02-14",
    "departureDate": "2027-02-27",
    "declaredCostEUR": 1800,
    "usPurpose": "Tourism"
  },
  "docs": {
    "passport": {
      "label": "Passport",
      "tag": "identity",
      "source": "Pages 1 and 2",
      "fields": {
        "surname": "Menon",
        "givenNames": "Jose Thomas",
        "fullName": "Jose Thomas Menon",
        "sex": "M",
        "nationality": "Indian",
        "dob": "1991-04-18",
        "passportNo": "Z4720913",
        "issueDate": "2016-09-02",
        "expiryDate": "2027-08-30",
        "issuingAuthority": "RPHSK",
        "birthPlace": "Kozhikode"
      }
    },
    "application": {
      "label": "Visa application (DS-7771/2)",
      "tag": "form",
      "source": "France Visas online form",
      "fields": {
        "surname": "Menon",
        "givenNames": "Jose Thomas",
        "fullName": "Jose Thomas Menon",
        "nationality": "Indian",
        "dob": "1991-04-18",
        "passportNo": "Z4720913",
        "appRef": "FR26-88213",
        "dateOfBirthPlace": "Kozhikode",
        "arrivalDate": "2027-02-14",
        "departureDate": "2027-02-27",
        "addressLine": "44B, Kunnamangalam Road, Kozhikode 673005",
        "addressCountry": "India",
        "hostName": "Claire Fontaine",
        "hostAddress": "9 Rue des Petites Ecuries, 75010 Paris",
        "previousStay": "Schengen 2024-06 to 2024-07",
        "usPurpose": "Tourism"
      }
    },
    "itinerary": {
      "label": "Flight itinerary",
      "tag": "booking",
      "source": "PDF, Emirates",
      "fields": {
        "passengerName": "MENON/JOSE THOMAS",
        "outboundDep": "2027-02-14",
        "outboundArr": "2027-02-14",
        "returnDep": "2027-02-27",
        "returnArr": "2027-02-27",
        "bookingRef": "EK-4471902",
        "fareEUR": 1120
      }
    },
    "accommodation": {
      "label": "Hotel booking",
      "tag": "booking",
      "source": "PDF, Booking.com",
      "fields": {
        "guestName": "Jose Menon",
        "checkIn": "2027-02-16",
        "checkOut": "2027-02-27",
        "addressLine": "9 Rue des Petites Ecuries, 75010 Paris",
        "addressCountry": "France",
        "totalEUR": 980,
        "confirmationNo": "HB-7741902"
      }
    },
    "hostLetter": {
      "label": "Host invitation letter",
      "tag": "supporting",
      "source": "Letter signed in Paris",
      "fields": {
        "hostName": "Claire Fontaine",
        "hostPassportNo": "18XZ004477",
        "hostAddress": "9 Rue des Petites Ecuries, 75010 Paris",
        "arrivalDate": "14/02/2027",
        "departureDate": "27/02/2027",
        "financialSupport": "1500",
        "signedDate": "2026-11-30"
      }
    },
    "bankStatement": {
      "label": "Bank statement",
      "tag": "financial",
      "source": "PDF, HDFC Bank",
      "fields": {
        "accountHolder": "Jose Thomas Menon",
        "statementDate": "2026-10-02",
        "closingBalanceEUR": 980,
        "accountNo": "5010029345678"
      }
    },
    "insurance": {
      "label": "Travel insurance",
      "tag": "supporting",
      "source": "PDF, Allianz",
      "fields": {
        "policyHolder": "Jose Thomas Menon",
        "policyNo": "AX-9917745",
        "coverageEUR": 30000,
        "startDate": "2027-02-13",
        "endDate": "2027-02-28",
        "medicalCoverEUR": 30000
      }
    },
    "employment": {
      "label": "Employment letter",
      "tag": "supporting",
      "source": "Letter, dated",
      "fields": {
        "employeeName": "Jose Thomas Menon",
        "employer": "Meridian Software Pvt Ltd",
        "designation": "Senior Engineer",
        "monthlySalaryEUR": 2600,
        "dateOfJoining": "2018-07-02",
        "letterDate": "2026-09-30",
        "approvedLeave": "yes"
      }
    }
  }
};
