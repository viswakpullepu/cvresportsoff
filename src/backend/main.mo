import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Authorization "authorization/access-control";
import MixinAuthorization "authorization/MixinAuthorization";
import Stripe "stripe/stripe";
import OutCall "http-outcalls/outcall";

actor {
  // IDs
  var nextGameId = 0;
  var nextRegistrationId = 0;
  var nextQuestionId = 0;

  // Types
  public type Question = {
    id : Nat;
    questionText : Text;
    fieldType : Text;
    required : Bool;
  };

  public type Answer = {
    questionId : Nat;
    answer : Text;
  };

  public type GameTile = {
    id : Nat;
    title : Text;
    platform : Text;
    bannerUrl : Text;
    entryFee : Nat;
    isOpen : Bool;
    description : Text;
    questions : [Question];
  };

  // V1 type kept for stable variable migration
  type RegistrationV1 = {
    id : Nat;
    gameId : Nat;
    playerName : Text;
    uid : Text;
    inGameName : Text;
    answers : [Answer];
    paymentStatus : Text;
    createdAt : Time.Time;
    owner : Principal;
  };

  // V2 type with paymentScreenshotUrl
  type RegistrationV2 = {
    id : Nat;
    gameId : Nat;
    playerName : Text;
    uid : Text;
    inGameName : Text;
    answers : [Answer];
    paymentStatus : Text;
    createdAt : Time.Time;
    owner : Principal;
    paymentScreenshotUrl : ?Text;
  };

  public type Registration = {
    id : Nat;
    gameId : Nat;
    playerName : Text;
    uid : Text;
    inGameName : Text;
    answers : [Answer];
    paymentStatus : Text;
    createdAt : Time.Time;
    owner : Principal;
    paymentScreenshotUrl : ?Text;
    transactionId : Text;
  };

  public type UserProfile = {
    name : Text;
  };

  // Authorization
  let accessControlState = Authorization.initState();
  include MixinAuthorization(accessControlState);

  // State
  let gameTiles = Map.empty<Nat, GameTile>();
  // Legacy stable var — receives old data on upgrade (no paymentScreenshotUrl field)
  let registrations = Map.empty<Nat, RegistrationV1>();
  // V2 stable var
  let registrationsV2 = Map.empty<Nat, RegistrationV2>();
  // Current stable var with transactionId
  let registrationsV3 = Map.empty<Nat, Registration>();
  // Transaction ID dedup map
  let usedTransactionIds = Map.empty<Text, Nat>();
  let globalQuestions = Map.empty<Nat, Question>();
  let userProfiles = Map.empty<Principal, UserProfile>();
  var stripeConfig : ?Stripe.StripeConfiguration = null;
  var migrationDone = false;
  var migrationV2Done = false;

  // Migrate V1 -> V2 on first upgrade
  system func postupgrade() {
    if (not migrationDone) {
      for ((k, v) in registrations.entries()) {
        let migrated : RegistrationV2 = {
          id = v.id;
          gameId = v.gameId;
          playerName = v.playerName;
          uid = v.uid;
          inGameName = v.inGameName;
          answers = v.answers;
          paymentStatus = v.paymentStatus;
          createdAt = v.createdAt;
          owner = v.owner;
          paymentScreenshotUrl = null;
        };
        registrationsV2.add(k, migrated);
        if (v.id + 1 > nextRegistrationId) {
          nextRegistrationId := v.id + 1;
        };
      };
      migrationDone := true;
    };
    if (not migrationV2Done) {
      for ((k, v) in registrationsV2.entries()) {
        let migrated : Registration = {
          id = v.id;
          gameId = v.gameId;
          playerName = v.playerName;
          uid = v.uid;
          inGameName = v.inGameName;
          answers = v.answers;
          paymentStatus = v.paymentStatus;
          createdAt = v.createdAt;
          owner = v.owner;
          paymentScreenshotUrl = v.paymentScreenshotUrl;
          transactionId = "";
        };
        registrationsV3.add(k, migrated);
        if (v.id + 1 > nextRegistrationId) {
          nextRegistrationId := v.id + 1;
        };
      };
      migrationV2Done := true;
    };
  };

  // Game Management (open to all callers — security enforced by frontend password)
  public shared func createGame(game : GameTile) : async Nat {
    let newGame : GameTile = {
      game with
      id = nextGameId;
    };
    gameTiles.add(nextGameId, newGame);
    nextGameId += 1;
    newGame.id;
  };

  public shared func updateGame(game : GameTile) : async () {
    if (not gameTiles.containsKey(game.id)) {
      Runtime.trap("Game not found");
    };
    gameTiles.remove(game.id);
    gameTiles.add(game.id, game);
  };

  public shared func deleteGame(gameId : Nat) : async () {
    if (not gameTiles.containsKey(gameId)) {
      Runtime.trap("Game not found");
    };
    gameTiles.remove(gameId);
  };

  // Game Queries (Public)
  public query func listOpenGames() : async [GameTile] {
    gameTiles.values().toArray().filter(func(g) { g.isOpen });
  };

  public query func listAllGames() : async [GameTile] {
    gameTiles.values().toArray();
  };

  public query func getGame(gameId : Nat) : async GameTile {
    switch (gameTiles.get(gameId)) {
      case (null) { Runtime.trap("Game not found") };
      case (?game) { game };
    };
  };

  // Transaction ID validation
  public query func checkTransactionId(txId : Text) : async Bool {
    if (txId == "") { return false };
    usedTransactionIds.containsKey(txId);
  };

  // Registration
  public shared ({ caller }) func submitRegistration(reg : Registration) : async Nat {
    // Validate transaction ID uniqueness
    if (reg.transactionId != "" and usedTransactionIds.containsKey(reg.transactionId)) {
      Runtime.trap("DUPLICATE_TRANSACTION_ID");
    };

    let newReg : Registration = {
      reg with
      id = nextRegistrationId;
      createdAt = Time.now();
      paymentStatus = "pending";
      owner = caller;
    };
    registrationsV3.add(nextRegistrationId, newReg);
    if (reg.transactionId != "") {
      usedTransactionIds.add(reg.transactionId, nextRegistrationId);
    };
    nextRegistrationId += 1;
    newReg.id;
  };

  public query func getRegistration(regId : Nat) : async Registration {
    switch (registrationsV3.get(regId)) {
      case (null) { Runtime.trap("Registration not found") };
      case (?reg) { reg };
    };
  };

  public query func getGameRegistrations(gameId : Nat) : async [Registration] {
    registrationsV3.values().toArray().filter(func(r) { r.gameId == gameId });
  };

  public shared func updatePaymentStatus(regId : Nat, status : Text) : async () {
    switch (registrationsV3.get(regId)) {
      case (null) { Runtime.trap("Registration not found") };
      case (?reg) {
        let updatedReg : Registration = {
          reg with
          paymentStatus = status;
        };
        registrationsV3.add(regId, updatedReg);
      };
    };
  };

  // Question Management (open to all callers — security enforced by frontend password)
  public shared func createQuestion(question : Question) : async Nat {
    let newQuestion : Question = {
      question with
      id = nextQuestionId;
    };
    globalQuestions.add(nextQuestionId, newQuestion);
    nextQuestionId += 1;
    newQuestion.id;
  };

  public shared func updateQuestion(question : Question) : async () {
    if (not globalQuestions.containsKey(question.id)) {
      Runtime.trap("Question not found");
    };
    globalQuestions.add(question.id, question);
  };

  public shared func deleteQuestion(qid : Nat) : async () {
    if (not globalQuestions.containsKey(qid)) {
      Runtime.trap("Question not found");
    };
    globalQuestions.remove(qid);
  };

  public query func getQuestions() : async [Question] {
    globalQuestions.values().toArray();
  };

  public query func getQuestion(qid : Nat) : async Question {
    switch (globalQuestions.get(qid)) {
      case (null) { Runtime.trap("Question not found") };
      case (?q) { q };
    };
  };

  // Stripe Payment Integration
  public query func isStripeConfigured() : async Bool {
    switch (stripeConfig) {
      case (null) { false };
      case (_) { true };
    };
  };

  public shared func setStripeConfiguration(config : Stripe.StripeConfiguration) : async () {
    stripeConfig := ?config;
  };

  func getStripeConfigurationInternal() : Stripe.StripeConfiguration {
    switch (stripeConfig) {
      case (null) { Runtime.trap("Stripe needs to be first configured") };
      case (?value) { value };
    };
  };

  public func getStripeSessionStatus(sessionId : Text) : async Stripe.StripeSessionStatus {
    await Stripe.getSessionStatus(getStripeConfigurationInternal(), sessionId, transform);
  };

  public shared ({ caller }) func createCheckoutSession(items : [Stripe.ShoppingItem], successUrl : Text, cancelUrl : Text) : async Text {
    await Stripe.createCheckoutSession(getStripeConfigurationInternal(), caller, items, successUrl, cancelUrl, transform);
  };

  public query func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };
};
