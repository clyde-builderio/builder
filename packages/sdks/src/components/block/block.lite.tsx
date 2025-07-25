import type { Signal } from '@builder.io/mitosis';
import {
  For,
  Show,
  onMount,
  onUpdate,
  useMetadata,
  useStore,
  useTarget,
} from '@builder.io/mitosis';
import { TARGET } from '../../constants/target.js';
import type {
  BuilderContextInterface,
  RegisteredComponents,
} from '../../context/types.js';
import { getBlockComponentOptions } from '../../functions/get-block-component-options.js';
import { getProcessedBlock } from '../../functions/get-processed-block.js';
import { isPreviewing } from '../../server-index.js';
import type { BuilderBlock } from '../../types/builder-block.js';
import DynamicDiv from '../dynamic-div.lite.jsx';
import { bindAnimations } from './animator.js';
import {
  generateKey,
  getComponent,
  getInheritedStyles,
  getRepeatItemData,
  provideBuilderBlock,
  provideBuilderContext,
  provideLinkComponent,
  provideRegisteredComponents,
} from './block.helpers.js';
import BlockWrapper from './components/block-wrapper.lite.jsx';
import type { ComponentProps } from './components/component-ref/component-ref.helpers.js';
import ComponentRef from './components/component-ref/component-ref.lite.jsx';
import RepeatedBlock from './components/repeated-block.lite.jsx';
import StyleWrapper from './components/style-wrapper.lite.jsx';

export type BlockProps = {
  block: BuilderBlock;
  context: Signal<BuilderContextInterface>;
  registeredComponents: RegisteredComponents;
  linkComponent: any;
};

useMetadata({
  elementTag: 'state.Tag',
  options: {
    vue: {
      asyncComponentImports: true,
    },
  },
  qwik: {
    setUseStoreFirst: true,
  },
  rsc: {
    componentType: 'server',
  },
});

export default function Block(props: BlockProps) {
  const state = useStore({
    get repeatItem() {
      return getRepeatItemData({
        block: props.block,
        context: props.context.value,
      });
    },
    /**
     * Simple agnostic memoization for the processed block
     * This is used to avoid re-processing the block on every render
     * We need to make this a property on an object so setState() isn't
     * called causing infinite rerenders e.g. in React
     */
    _processedBlock: { value: null as BuilderBlock | null, update: false },
    get processedBlock(): BuilderBlock {
      useTarget({
        svelte: () => {},
        vue: () => {},
        angular: () => {},
        qwik: () => {},
        solid: () => {},

        // @ts-expect-error: missing return value
        default: () => {
          if (
            state._processedBlock.value &&
            !state._processedBlock.update &&
            !isPreviewing()
          ) {
            return state._processedBlock.value;
          }
        },
      });
      const blockToUse = props.block.repeat?.collection
        ? props.block
        : getProcessedBlock({
            block: props.block,
            localState: props.context.value.localState,
            rootState: props.context.value.rootState,
            rootSetState: props.context.value.rootSetState,
            context: props.context.value.context,
          });

      useTarget({
        svelte: () => {},
        vue: () => {},
        angular: () => {},
        qwik: () => {},
        solid: () => {},
        default: () => {
          state._processedBlock.value = blockToUse;
          state._processedBlock.update = false;
        },
      });

      return blockToUse;
    },
    get blockComponent() {
      return getComponent({
        block: state.processedBlock,
        registeredComponents: props.registeredComponents,
        model: props.context.value.model,
      });
    },
    get Tag() {
      const shouldUseLink =
        props.block.tagName === 'a' ||
        state.processedBlock.properties?.href ||
        state.processedBlock.href;

      if (shouldUseLink) {
        return (
          props.linkComponent ||
          useTarget({
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            reactNative: BaseText,
            default: 'a',
          })
        );
      }

      return useTarget({
        /**
         * `tagName` will always be an HTML element. In the future, we might't map those to the right React Native components
         * For now, we just use `View` for all of them.
         * eslint-disable-next-line @typescript-eslint/ban-ts-comment
         * @ts-ignore */
        reactNative: View,
        angular: props.block.tagName || DynamicDiv,
        default: props.block.tagName || 'div',
      });
    },
    get canShowBlock() {
      if (props.block.repeat?.collection) {
        if (state.repeatItem?.length) return true;
        return false;
      }

      const shouldHide =
        'hide' in state.processedBlock ? state.processedBlock.hide : false;
      const shouldShow =
        'show' in state.processedBlock ? state.processedBlock.show : true;

      return shouldShow && !shouldHide;
    },

    get childrenWithoutParentComponent() {
      /**
       * When there is no `componentRef`, there might still be children that need to be rendered. In this case,
       * we render them outside of `componentRef`.
       * NOTE: We make sure not to render this if `repeatItemData` is non-null, because that means we are rendering an array of
       * blocks, and the children will be repeated within those blocks.
       */
      const shouldRenderChildrenOutsideRef =
        !state.blockComponent?.component && !state.repeatItem;

      return shouldRenderChildrenOutsideRef
        ? state.processedBlock.children ?? []
        : [];
    },

    get componentRefProps(): ComponentProps {
      return {
        blockChildren: state.processedBlock.children ?? [],
        componentRef: state.blockComponent?.component,
        componentOptions: {
          ...getBlockComponentOptions(
            state.processedBlock,
            props.context.value
          ),
          ...provideBuilderBlock(state.blockComponent, state.processedBlock),
          ...provideBuilderContext(state.blockComponent, props.context),
          ...provideLinkComponent(state.blockComponent, props.linkComponent),
          ...provideRegisteredComponents(
            state.blockComponent,
            props.registeredComponents,
            props.context.value.model
          ),
        },
        context: useTarget({
          reactNative: {
            ...props.context.value,
            inheritedStyles: getInheritedStyles({
              block: state.processedBlock,
              context: props.context.value,
            }),
          } as any,
          default: props.context,
        }),
        linkComponent: props.linkComponent,
        registeredComponents: props.registeredComponents,
        builderBlock: state.processedBlock,
        includeBlockProps: state.blockComponent?.noWrap === true,
        isInteractive: !(state.blockComponent?.isRSC && TARGET === 'rsc'),
      };
    },
  });

  /**
   * This trick forces the component to re-compute the `processedBlock` on every update.
   */
  onUpdate(() => {
    useTarget({
      svelte: () => {},
      vue: () => {},
      angular: () => {},
      qwik: () => {},
      solid: () => {},
      default: () => {
        state._processedBlock.update = true;
      },
    });
  });

  onMount(() => {
    useTarget({
      reactNative: () => {},
      angular: () => {
        const blockId = state.processedBlock.id;
        const animations = state.processedBlock.animations;
        if (animations && blockId) {
          // in Angular, the DynamicDiv sets attributes (builder-id) on the element late (ngAfterViewInit)
          // so we need to wait for them to be attached to the DOM before calling this else we'll not find the element
          requestAnimationFrame(() => {
            bindAnimations(
              animations.map((animation) => ({
                ...animation,
                elementId: blockId,
              }))
            );
          });
        }
      },
      default: () => {
        const blockId = state.processedBlock.id;
        const animations = state.processedBlock.animations;
        if (animations && blockId) {
          bindAnimations(
            animations.map((animation) => ({
              ...animation,
              elementId: blockId,
            }))
          );
        }
      },
    });
  });

  return (
    <Show when={state.canShowBlock}>
      <StyleWrapper
        block={state.processedBlock}
        context={props.context.value}
        id={props.block.id}
      />
      <Show
        when={!state.blockComponent?.noWrap}
        else={
          <Show
            when={!state.repeatItem}
            else={
              <For each={state.repeatItem}>
                {(data, index) => (
                  <RepeatedBlock
                    key={generateKey(index)}
                    repeatContext={data.context}
                    block={data.block}
                    registeredComponents={props.registeredComponents}
                    linkComponent={props.linkComponent}
                  />
                )}
              </For>
            }
          >
            <ComponentRef
              componentRef={state.componentRefProps.componentRef}
              componentOptions={state.componentRefProps.componentOptions}
              blockChildren={state.componentRefProps.blockChildren}
              context={state.componentRefProps.context}
              registeredComponents={
                state.componentRefProps.registeredComponents
              }
              linkComponent={state.componentRefProps.linkComponent}
              builderBlock={state.componentRefProps.builderBlock}
              includeBlockProps={state.componentRefProps.includeBlockProps}
              isInteractive={state.componentRefProps.isInteractive}
            />
          </Show>
        }
      >
        <Show
          when={!state.repeatItem}
          else={
            <For each={state.repeatItem}>
              {(data, index) => (
                <RepeatedBlock
                  key={generateKey(index)}
                  repeatContext={data.context}
                  block={data.block}
                  registeredComponents={props.registeredComponents}
                  linkComponent={props.linkComponent}
                />
              )}
            </For>
          }
        >
          <BlockWrapper
            Wrapper={state.Tag}
            block={state.processedBlock}
            context={props.context}
          >
            <ComponentRef
              componentRef={state.componentRefProps.componentRef}
              componentOptions={state.componentRefProps.componentOptions}
              blockChildren={state.componentRefProps.blockChildren}
              context={state.componentRefProps.context}
              registeredComponents={
                state.componentRefProps.registeredComponents
              }
              linkComponent={state.componentRefProps.linkComponent}
              builderBlock={state.componentRefProps.builderBlock}
              includeBlockProps={state.componentRefProps.includeBlockProps}
              isInteractive={state.componentRefProps.isInteractive}
            />
            <For each={state.childrenWithoutParentComponent}>
              {(child) => (
                <Block
                  key={child.id}
                  block={child}
                  context={useTarget({
                    reactNative: {
                      ...props.context.value,
                      inheritedStyles: getInheritedStyles({
                        block: state.processedBlock,
                        context: props.context.value,
                      }),
                    } as any,
                    default: props.context,
                  })}
                  registeredComponents={props.registeredComponents}
                  linkComponent={props.linkComponent}
                />
              )}
            </For>
          </BlockWrapper>
        </Show>
      </Show>
    </Show>
  );
}
