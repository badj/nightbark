@regression
Feature: Cart

  @[700001]
  Scenario: A customer checks out from the cart page
    Given items in the cart
    Then the order is placed
