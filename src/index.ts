import {
  
  exampleMatchEvents,
  applyEvents,
  computeStats,
  getCheckoutRoutes
} from "./darts501";




// 2) Checkout-Routen für ein paar Rests zeigen
for (const rest of [170, 100, 32, 9]) {
  const routes = getCheckoutRoutes(rest, "safe", { preferDoubles: ["D16", "D20"] });
  console.log(`\nCheckout-Routen für ${rest}:`);
  console.log(routes.map(r => r.route.join(" → ")).join(" | ") || "— keine —");
}
