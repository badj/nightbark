@regression
Feature: Checkout

  @[700001] @ATH01
  Scenario: A customer checks out with a saved card
    Given a saved card
    Then the order is placed
