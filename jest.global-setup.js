// Cycle boundaries are local calendar dates; run tests in the app's
// target time zone so results match the phone.
module.exports = async () => {
  process.env.TZ = "Asia/Kolkata";
};
