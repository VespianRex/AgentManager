import { z } from "zod";
export declare const UniqueModelIntricaciesSchema: z.ZodObject<{
    common_pitfalls: z.ZodArray<z.ZodString>;
    special_behaviors: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type UniqueModelIntricacies = z.infer<typeof UniqueModelIntricaciesSchema>;
export declare const ModelMetadataSchema: z.ZodObject<{
    context_window_size: z.ZodOptional<z.ZodNumber>;
    recommended_top_k: z.ZodOptional<z.ZodNumber>;
    recommended_top_p: z.ZodOptional<z.ZodNumber>;
    prompting_style_guidelines: z.ZodOptional<z.ZodString>;
    unique_model_intricacies: z.ZodOptional<z.ZodObject<{
        common_pitfalls: z.ZodArray<z.ZodString>;
        special_behaviors: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const RequiredModelMetadataSchema: z.ZodObject<{
    context_window_size: z.ZodNumber;
    recommended_top_k: z.ZodNumber;
    recommended_top_p: z.ZodNumber;
    prompting_style_guidelines: z.ZodString;
    unique_model_intricacies: z.ZodObject<{
        common_pitfalls: z.ZodArray<z.ZodString>;
        special_behaviors: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ModelMetadata = z.infer<typeof RequiredModelMetadataSchema>;
export declare const validateModelMetadata: (metadata: unknown) => ModelMetadata;
export declare const validatePartialModelMetadata: (metadata: unknown) => Partial<ModelMetadata>;
export declare const MODEL_METADATA_REGISTRY: Record<string, ModelMetadata>;
//# sourceMappingURL=model-metadata.d.ts.map