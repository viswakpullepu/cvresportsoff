import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export type Time = bigint;
export interface Registration {
    id: bigint;
    uid: string;
    inGameName: string;
    paymentStatus: string;
    owner: Principal;
    answers: Array<Answer>;
    createdAt: Time;
    gameId: bigint;
    playerName: string;
    paymentScreenshotUrl: [string] | [];
}
export interface GameTile {
    id: bigint;
    title: string;
    description: string;
    isOpen: boolean;
    platform: string;
    questions: Array<Question>;
    bannerUrl: string;
    entryFee: bigint;
}
export interface http_header {
    value: string;
    name: string;
}
export interface http_request_result {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface ShoppingItem {
    productName: string;
    currency: string;
    quantity: bigint;
    priceInCents: bigint;
    productDescription: string;
}
export interface TransformationInput {
    context: Uint8Array;
    response: http_request_result;
}
export interface Answer {
    answer: string;
    questionId: bigint;
}
export type StripeSessionStatus = {
    __kind__: "completed";
    completed: {
        userPrincipal?: string;
        response: string;
    };
} | {
    __kind__: "failed";
    failed: {
        error: string;
    };
};
export interface StripeConfiguration {
    allowedCountries: Array<string>;
    secretKey: string;
}
export interface Question {
    id: bigint;
    questionText: string;
    required: boolean;
    fieldType: string;
}
export interface UserProfile {
    name: string;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    createCheckoutSession(items: Array<ShoppingItem>, successUrl: string, cancelUrl: string): Promise<string>;
    createGame(game: GameTile): Promise<bigint>;
    createQuestion(question: Question): Promise<bigint>;
    deleteGame(gameId: bigint): Promise<void>;
    deleteQuestion(qid: bigint): Promise<void>;
    getCallerRegistrations(): Promise<Array<Registration>>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getGame(gameId: bigint): Promise<GameTile>;
    getGameRegistrations(gameId: bigint): Promise<Array<Registration>>;
    getQuestion(qid: bigint): Promise<Question>;
    getQuestions(): Promise<Array<Question>>;
    getRegistration(regId: bigint): Promise<Registration>;
    getStripeSessionStatus(sessionId: string): Promise<StripeSessionStatus>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    isStripeConfigured(): Promise<boolean>;
    listAllGames(): Promise<Array<GameTile>>;
    listOpenGames(): Promise<Array<GameTile>>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    setStripeConfiguration(config: StripeConfiguration): Promise<void>;
    submitRegistration(reg: Registration): Promise<bigint>;
    transform(input: TransformationInput): Promise<TransformationOutput>;
    updateGame(game: GameTile): Promise<void>;
    updatePaymentStatus(regId: bigint, status: string): Promise<void>;
    updateQuestion(question: Question): Promise<void>;
}
