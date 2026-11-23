
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const OWNER_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_OWNER_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const BOOKING_ID = "cccccccccccccccccccccccc";

class FakeObjectId {
  constructor(value) {
    if (!FakeObjectId.isValid(value)) {
      throw new Error("Invalid ObjectId");
    }

    this.value = value.toLowerCase();
  }

  static isValid(value) {
    return (
      typeof value === "string" &&
      /^[a-fA-F0-9]{24}$/.test(value)
    );
  }

  toHexString() {
    return this.value;
  }
}

function normalize(value) {
  return value instanceof FakeObjectId
    ? value.toHexString()
    : value;
}

function matches(document, filter) {
  return Object.entries(filter).every(
    ([key, value]) =>
      normalize(document[key]) === normalize(value),
  );
}

function createEnvironment(initialBooking) {
  const booking = {
    _id: BOOKING_ID,
    ownerId: OWNER_ID,
    status: "pending",
    paymentStatus: "unpaid",
    ...initialBooking,
  };

  const calls = {
    updates: 0,
  };

  const collection = {
    async updateOne(filter, update) {
      calls.updates += 1;

      if (!matches(booking, filter)) {
        return {
          matchedCount: 0,
          modifiedCount: 0,
        };
      }

      Object.assign(booking, update.$set);

      return {
        matchedCount: 1,
        modifiedCount: 1,
      };
    },

    async findOne(filter) {
      if (!matches(booking, filter)) {
        return null;
      }

      return {
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      };
    },
  };

  const getDB = () => ({
    collection(name) {
      assert.equal(name, "bookings");
      return collection;
    },
  });

  return {
    booking,
    calls,
    getDB,
  };
}

// Load the actual controller implementation.
// Isolate only confirmBooking so no real DB connection is used.
const source = readFileSync(
  new URL("../src/controllers/booking.controller.js", import.meta.url),
  "utf8",
);

const startMarker = "export const confirmBooking =";
const endMarker = "// Reject pending";

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

assert.ok(
  start !== -1 && end > start,
  "Could not locate confirmBooking in the controller",
);

const functionSource = source
  .slice(start + startMarker.length, end)
  .trim()
  .replace(/;\s*$/, "");

function loadController(environment) {
  return runInNewContext(
    `(${functionSource})`,
    {
      ObjectId: FakeObjectId,
      getDB: environment.getDB,
      console,
      Date,
    },
    {
      timeout: 1000,
      filename: "confirmBooking-test.js",
    },
  );
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(data) {
      this.body = data;
      return this;
    },
  };
}

async function execute(
  initialBooking,
  {
    role = "owner",
    userId = OWNER_ID,
    bookingId = BOOKING_ID,
  } = {},
) {
  const environment = createEnvironment(initialBooking);
  const confirmBooking = loadController(environment);

  const req = {
    auth: {
      role,
      userId,
    },
    params: {
      id: bookingId,
    },
  };

  const res = createResponse();

  await confirmBooking(req, res);

  return {
    ...environment,
    response: res,
  };
}

test("Pending + Unpaid cannot be confirmed", async () => {
  const result = await execute({
    status: "pending",
    paymentStatus: "unpaid",
  });

  assert.equal(result.response.statusCode, 409);
  assert.equal(result.response.body.success, false);
  assert.equal(result.booking.status, "pending");
  assert.equal(result.booking.paymentStatus, "unpaid");

  console.log("PASS: Unpaid booking rejected with 409");
});

test("Pending + Paid can be confirmed", async () => {
  const result = await execute({
    status: "pending",
    paymentStatus: "paid",
  });

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body.success, true);
  assert.equal(result.booking.status, "confirmed");
  assert.equal(result.booking.paymentStatus, "paid");
  assert.ok(result.booking.confirmedAt instanceof Date);

  console.log("PASS: Paid booking confirmed with 200");
});

test("Already Confirmed cannot be confirmed again", async () => {
  const result = await execute({
    status: "confirmed",
    paymentStatus: "paid",
  });

  assert.equal(result.response.statusCode, 409);
  assert.equal(result.booking.status, "confirmed");

  console.log("PASS: Duplicate confirmation rejected");
});

test("Another Owner cannot confirm the booking", async () => {
  const result = await execute(
    {
      status: "pending",
      paymentStatus: "paid",
    },
    {
      userId: OTHER_OWNER_ID,
    },
  );

  assert.equal(result.response.statusCode, 404);
  assert.equal(result.booking.status, "pending");

  console.log("PASS: Different Owner denied");
});

test("Customer cannot confirm any booking", async () => {
  const result = await execute(
    {
      status: "pending",
      paymentStatus: "paid",
    },
    {
      role: "customer",
    },
  );

  assert.equal(result.response.statusCode, 403);
  assert.equal(result.booking.status, "pending");
  assert.equal(result.calls.updates, 0);

  console.log("PASS: Customer role denied");
});

test("Missing payment status cannot be confirmed", async () => {
  const result = await execute({
    status: "pending",
    paymentStatus: undefined,
  });

  assert.equal(result.response.statusCode, 409);
  assert.equal(result.booking.status, "pending");

  console.log("PASS: Missing payment status rejected");
});

test("Invalid booking ID is rejected", async () => {
  const result = await execute(
    {
      status: "pending",
      paymentStatus: "paid",
    },
    {
      bookingId: "invalid-id",
    },
  );

  assert.equal(result.response.statusCode, 400);
  assert.equal(result.calls.updates, 0);

  console.log("PASS: Invalid booking ID rejected");
});