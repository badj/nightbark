@regression @IDM01-AC01
Feature: Registration

  @[700010]
  Scenario: A customer registers with an email
    Given a new customer
    Then the account exists

  @[700011]
  Scenario: A customer registers and skips the passkey
    Given a new customer
    Then the account exists

  @[700012]
  Scenario: A customer registers on mobile
    Given a new customer
    Then the account exists
