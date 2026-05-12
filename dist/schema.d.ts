import { z } from "zod";
export declare const AgentPermissionSchema: z.ZodObject<{
    edit: z.ZodOptional<z.ZodEnum<{
        ask: "ask";
        allow: "allow";
        deny: "deny";
    }>>;
    bash: z.ZodOptional<z.ZodEnum<{
        ask: "ask";
        allow: "allow";
        deny: "deny";
    }>>;
    read: z.ZodOptional<z.ZodEnum<{
        ask: "ask";
        allow: "allow";
        deny: "deny";
    }>>;
    write: z.ZodOptional<z.ZodEnum<{
        ask: "ask";
        allow: "allow";
        deny: "deny";
    }>>;
    webfetch: z.ZodOptional<z.ZodEnum<{
        ask: "ask";
        allow: "allow";
        deny: "deny";
    }>>;
    doom_loop: z.ZodOptional<z.ZodEnum<{
        ask: "ask";
        allow: "allow";
        deny: "deny";
    }>>;
    external_directory: z.ZodOptional<z.ZodEnum<{
        ask: "ask";
        allow: "allow";
        deny: "deny";
    }>>;
}, z.core.$loose>;
export declare const AgentConfigSchema: z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    permission: z.ZodOptional<z.ZodObject<{
        edit: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        bash: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        read: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        write: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        webfetch: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        doom_loop: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        external_directory: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
    }, z.core.$loose>>;
    fallback: z.ZodOptional<z.ZodString>;
    fallbacks: z.ZodOptional<z.ZodArray<z.ZodString>>;
    fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$loose>;
export declare const CategoryConfigSchema: z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    permission: z.ZodOptional<z.ZodObject<{
        edit: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        bash: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        read: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        write: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        webfetch: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        doom_loop: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
        external_directory: z.ZodOptional<z.ZodEnum<{
            ask: "ask";
            allow: "allow";
            deny: "deny";
        }>>;
    }, z.core.$loose>>;
    fallback: z.ZodOptional<z.ZodString>;
    fallbacks: z.ZodOptional<z.ZodArray<z.ZodString>>;
    fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$loose>;
export declare const AgentManagerDocumentSchema: z.ZodObject<{
    api_key: z.ZodOptional<z.ZodString>;
    agents: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        permission: z.ZodOptional<z.ZodObject<{
            edit: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            bash: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            read: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            write: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            webfetch: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            doom_loop: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            external_directory: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
        }, z.core.$loose>>;
        fallback: z.ZodOptional<z.ZodString>;
        fallbacks: z.ZodOptional<z.ZodArray<z.ZodString>>;
        fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$loose>>>;
    categories: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        permission: z.ZodOptional<z.ZodObject<{
            edit: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            bash: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            read: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            write: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            webfetch: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            doom_loop: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
            external_directory: z.ZodOptional<z.ZodEnum<{
                ask: "ask";
                allow: "allow";
                deny: "deny";
            }>>;
        }, z.core.$loose>>;
        fallback: z.ZodOptional<z.ZodString>;
        fallbacks: z.ZodOptional<z.ZodArray<z.ZodString>>;
        fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$loose>>>;
    disabled_hooks: z.ZodOptional<z.ZodArray<z.ZodString>>;
    disabled_agents: z.ZodOptional<z.ZodArray<z.ZodString>>;
    disabled_skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
    sisyphus_agent: z.ZodOptional<z.ZodString>;
    background_task: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AgentManagerDocument = z.infer<typeof AgentManagerDocumentSchema>;
export declare const validateAgentManagerDocument: (document: unknown) => AgentManagerDocument;
/**
 * Checks for circular references in an object graph.
 *
 * Tracks the active traversal path rather than every object ever visited, so
 * shared subobjects are accepted while true ancestor cycles are rejected.
 */
export declare const hasCircularReference: (input: unknown, _seen?: WeakSet<object>, depth?: number) => boolean;
export declare const validatePartialAgentManagerDocument: (document: unknown) => Partial<AgentManagerDocument>;
/**
 * Validates a single agent configuration.
 */
export declare function validateAgentConfig(config: unknown): z.infer<typeof AgentConfigSchema>;
//# sourceMappingURL=schema.d.ts.map