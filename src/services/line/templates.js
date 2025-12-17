/**
 * Order message templates for LINE (Flex messages)
 * Keep templates separate from sending logic.
 */

function buildSuccessFlex(orderResult) {
  return {
    type: "flex",
    altText: "ご購入ありがとうございます",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "ご購入ありがとうございます。",
            wrap: true,
            weight: "bold",
            size: "xl",
            color: "#1DB446",
          },
          {
            type: "text",
            text: `注文が確定しました。注文番号: ${
              orderResult.order_number || ""
            }`,
            wrap: true,
            size: "md",
            color: "#333333",
            margin: "md",
          },
        ],
      },
    },
  };
}

function buildFailureFlex(displayName, product = {}, shopUrl = "") {
  // `quickReply` must be placed at the top-level of the message object
  // (not inside `contents`). Place `quickReply` next to `contents`.
  return {
    type: "flex",
    altText: "システムエラーにより手続きが最後まで完了しませんでした",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${displayName}様、システムエラーにより手続きが最後まで完了しませんでした。\nお手数ですが、下記ボタンから改めてご購入手続きをお願いいたします。`,
            wrap: true,
            size: "md",
            color: "#333333",
            margin: "md",
          },
        ],
      },
    },
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "再開する",
            text: "再開する",
            data: JSON.stringify({ action: "confirmEcForceProduct", product }),
          },
        },
        {
          type: "action",
          action: {
            type: "uri",
            label: "別の決済方法",
            text: "別の決済方法",
            uri: shopUrl ? `${shopUrl.replace(/\/$/, "")}/shop` : "",
          },
        },
      ],
    },
  };
}

module.exports = {
  buildSuccessFlex,
  buildFailureFlex,
};
