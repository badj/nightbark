# FIXTURE — must fire: the SAME case id as checkout.feature.
@regression
Feature: Cart

  @[700101]
  Scenario: A customer completes checkout from the cart page
    Given items in the cart
    When they check out
    Then the order is confirmed
