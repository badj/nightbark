@regression
Feature: Login smoke

  @[700020] @[700021] @[700022] @SMK-W01
  Scenario: A registered customer signs in
    Given a registered customer
    Then the dashboard loads
